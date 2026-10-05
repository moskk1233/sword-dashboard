import { schema } from '@osd/config-schema';
import { IRouter } from '../../../../src/core/server';
import { API_BASE } from '../../common';
import { FIREBASE_APP_COMPAT_B64, FIREBASE_MESSAGING_COMPAT_B64 } from '../fcm_sdk';
import { SettingsStore } from '../lib/settings_store';
import { Guard } from './guard';

const JS_HEADERS = {
  'content-type': 'application/javascript; charset=utf-8',
  'cache-control': 'public, max-age=86400',
};

const decode = (b64: string) => Buffer.from(b64, 'base64').toString('utf8');

/**
 * Routes that let a SOC user turn on web push for their own browser:
 *  - the Firebase SDK and service worker are served same-origin (the CSP forbids external CDNs)
 *  - /fcm/config hands the browser the public web config + VAPID key
 *  - /fcm/register-device stores the registration token the browser obtained
 */
export function registerFcmRoutes(router: IRouter, guard: Guard, store: SettingsStore) {
  // Public web config + VAPID so the browser can register. Non-secret.
  router.get(
    { path: `${API_BASE}/fcm/config`, validate: false },
    guard({ level: 'soc' }, async (context, request, response) =>
      response.ok({ body: await store.getWebPush() })
    )
  );

  // Vendored Firebase compat SDK, served same-origin so the page can load it under the CSP.
  router.get(
    {
      path: `${API_BASE}/fcm/sdk/{name}`,
      validate: {
        params: schema.object({
          name: schema.oneOf([schema.literal('app.js'), schema.literal('messaging.js')]),
        }),
      },
    },
    guard({ level: 'soc' }, async (context, request, response) => {
      const body =
        request.params.name === 'app.js'
          ? decode(FIREBASE_APP_COMPAT_B64)
          : decode(FIREBASE_MESSAGING_COMPAT_B64);
      return response.ok({ headers: JS_HEADERS, body });
    })
  );

  // The Firebase messaging service worker. The SDK is inlined (not importScripts) so the worker needs
  // no further authenticated fetches, and this project's web config is injected.
  router.get(
    { path: `${API_BASE}/fcm/sw.js`, validate: false },
    guard({ level: 'soc' }, async (context, request, response) => {
      const { configured, webConfig } = await store.getWebPush();
      if (!configured || !webConfig) {
        return response.ok({
          headers: JS_HEADERS,
          body: '/* SWORD: web push is not configured by the administrator yet */',
        });
      }
      const sw = `${decode(FIREBASE_APP_COMPAT_B64)}
${decode(FIREBASE_MESSAGING_COMPAT_B64)}
firebase.initializeApp(${JSON.stringify(webConfig)});
firebase.messaging().onBackgroundMessage(function (payload) {
  var n = payload.notification || {};
  self.registration.showNotification(n.title || 'SWORD Alert', {
    body: n.body || '',
    tag: (payload.data && payload.data.src_ip) || undefined,
  });
});
`;
      return response.ok({ headers: JS_HEADERS, body: sw });
    })
  );

  // The browser posts the registration token it obtained; stored so the notifier can push to it.
  router.post(
    {
      path: `${API_BASE}/fcm/register-device`,
      validate: {
        body: schema.object({
          token: schema.string({ minLength: 20, maxLength: 4096 }),
          label: schema.maybe(schema.string({ maxLength: 64 })),
        }),
      },
    },
    guard({ level: 'soc' }, async (context, request, response, access) => {
      const label = (request.body.label?.trim() || `${access.username} · browser`).slice(0, 64);
      const added = await store.addDeviceToken(label, request.body.token.trim());
      return response.ok({ body: { ok: true, added } });
    })
  );
}
