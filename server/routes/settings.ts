import { schema } from '@osd/config-schema';
import { IRouter } from '../../../../src/core/server';
import { API_BASE, ATTACK_FAMILY_KEYS, SAMPLE_ATTACK, TestResult } from '../../common';
import { Notifier } from '../lib/notifier';
import { SettingsStore } from '../lib/settings_store';
import { Guard, errorMessage } from './guard';

const families = schema.arrayOf(
  schema.string({
    validate: (v) =>
      (ATTACK_FAMILY_KEYS as string[]).includes(v) ? undefined : `Unknown attack family "${v}"`,
  }),
  { maxSize: ATTACK_FAMILY_KEYS.length }
);

const minConfidence = schema.number({ min: 0, max: 1 });
const cooldown = schema.number({ min: 0, max: 86400 });

const settingsPatch = schema.object({
  fcm: schema.maybe(
    schema.object({
      enabled: schema.maybe(schema.boolean()),
      serviceAccount: schema.maybe(schema.nullable(schema.string({ maxLength: 20000 }))),
      deviceTokens: schema.maybe(
        schema.arrayOf(
          schema.object({
            label: schema.string({ minLength: 1, maxLength: 64 }),
            token: schema.string({ minLength: 20, maxLength: 4096 }),
          }),
          { maxSize: 50 }
        )
      ),
      title: schema.maybe(schema.string({ minLength: 1, maxLength: 200 })),
      body: schema.maybe(schema.string({ minLength: 1, maxLength: 1000 })),
      cooldownSeconds: schema.maybe(cooldown),
      minConfidence: schema.maybe(minConfidence),
      families: schema.maybe(families),
    })
  ),
  dashboard: schema.maybe(
    schema.object({
      refreshSeconds: schema.maybe(schema.number({ min: 5, max: 3600 })),
      liveToasts: schema.maybe(schema.boolean()),
    })
  ),
});

export function registerSettingsRoutes(
  router: IRouter,
  guard: Guard,
  store: SettingsStore,
  notifier: Notifier
) {
  // Non-secret display preferences, needed by every SWORD user.
  router.get(
    { path: `${API_BASE}/ui-settings`, validate: false },
    guard({ level: 'soc' }, async (context, request, response) =>
      response.ok({ body: await store.getDashboard() })
    )
  );

  router.get(
    { path: `${API_BASE}/settings`, validate: false },
    guard({ level: 'admin' }, async (context, request, response) =>
      response.ok({ body: await store.getPublic() })
    )
  );

  router.put(
    { path: `${API_BASE}/settings`, validate: { body: settingsPatch } },
    guard({ level: 'admin' }, async (context, request, response, access) => {
      try {
        return response.ok({ body: await store.update(request.body, access.username) });
      } catch (e) {
        // parseServiceAccount errors
        if (e instanceof Error && /Service account/.test(e.message)) {
          return response.badRequest({ body: { message: e.message } });
        }
        throw e;
      }
    })
  );

  // Sends a sample alert using the saved settings overlaid with the (unsaved) form values.
  router.post(
    {
      path: `${API_BASE}/settings/test/{channel}`,
      validate: {
        params: schema.object({
          channel: schema.literal('fcm'),
        }),
        body: settingsPatch,
      },
    },
    guard({ level: 'admin' }, async (context, request, response) => {
      let result: TestResult;
      try {
        const resolved = await store.getResolved(request.body);
        const sample = { ...SAMPLE_ATTACK, timestamp: new Date().toISOString() };
        result = await notifier.testFcm(resolved, sample);
      } catch (e) {
        result = { ok: false, message: errorMessage(e) };
      }
      return response.ok({ body: result });
    })
  );

  router.get(
    { path: `${API_BASE}/notifier/status`, validate: false },
    guard({ level: 'admin' }, async (context, request, response) =>
      response.ok({ body: notifier.getStatus() })
    )
  );
}
