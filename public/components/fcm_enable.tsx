import React, { useCallback, useEffect, useState } from 'react';
import { EuiButtonEmpty, EuiToolTip } from '@elastic/eui';
import { CoreStart } from '../../../../src/core/public';
import { API_BASE } from '../../common';
import { SwordApi, errorText } from '../api';

const TOKEN_KEY = 'sword_fcm_token';

// Loads a same-origin script once (the CSP forbids external CDNs, so the SDK is served by the plugin).
const loaded = new Set<string>();
const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    if (loaded.has(src)) return resolve();
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => {
      loaded.add(src);
      resolve();
    };
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });

type Status = 'checking' | 'unavailable' | 'ready' | 'working' | 'enabled';

/**
 * One-click web-push registration for the current browser: ask permission, register the service
 * worker, obtain an FCM token and hand it to the server. After the first grant the browser keeps the
 * token refreshed itself — the user never does this again on this device.
 */
export const FcmEnable = ({ core, api }: { core: CoreStart; api: SwordApi }) => {
  const [status, setStatus] = useState<Status>('checking');
  const toasts = core.notifications.toasts;

  const supported =
    typeof Notification !== 'undefined' && 'serviceWorker' in navigator && window.isSecureContext;

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supported) return alive && setStatus('unavailable');
      try {
        const cfg = await api.fcmConfig();
        if (!alive) return;
        if (!cfg.configured) return setStatus('unavailable');
        const already =
          Notification.permission === 'granted' && Boolean(localStorage.getItem(TOKEN_KEY));
        setStatus(already ? 'enabled' : 'ready');
      } catch {
        if (alive) setStatus('unavailable');
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, supported]);

  const enable = useCallback(async () => {
    setStatus('working');
    try {
      const cfg = await api.fcmConfig();
      if (!cfg.configured || !cfg.webConfig || !cfg.vapidKey) {
        throw new Error('Web push is not configured by the administrator');
      }
      const base = (p: string) => core.http.basePath.prepend(`${API_BASE}${p}`);
      await loadScript(base('/fcm/sdk/app.js'));
      await loadScript(base('/fcm/sdk/messaging.js'));

      const firebase = (window as any).firebase;
      if (!firebase) throw new Error('Firebase SDK did not load');
      if (!firebase.apps.length) firebase.initializeApp(cfg.webConfig);
      const messaging = firebase.messaging();

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notifications were blocked by the browser');

      const reg = await navigator.serviceWorker.register(base('/fcm/sw.js'));
      const token: string = await messaging.getToken({
        vapidKey: cfg.vapidKey,
        serviceWorkerRegistration: reg,
      });
      if (!token) throw new Error('Could not obtain a token');

      await api.registerFcmDevice(token);
      try {
        localStorage.setItem(TOKEN_KEY, token);
      } catch {
        /* private mode */
      }

      // Foreground pushes: show a toast while the dashboard is open.
      messaging.onMessage((payload: any) => {
        const n = payload?.notification ?? {};
        toasts.addWarning({ title: n.title || 'SWORD Alert', text: n.body || '' });
      });

      setStatus('enabled');
      toasts.addSuccess('Push notifications enabled on this device');
    } catch (e) {
      setStatus('ready');
      toasts.addDanger({ title: 'Could not enable notifications', text: errorText(e) });
    }
  }, [api, core, toasts]);

  if (status === 'checking' || status === 'unavailable') return null;

  if (status === 'enabled') {
    return (
      <EuiToolTip content="This browser will receive SWORD push alerts">
        <EuiButtonEmpty size="xs" color="ghost" iconType="check" isDisabled>
          Alerts on
        </EuiButtonEmpty>
      </EuiToolTip>
    );
  }

  return (
    <EuiToolTip content="Receive SWORD alerts on this device, even when the dashboard is closed">
      <EuiButtonEmpty
        size="xs"
        color="ghost"
        iconType="bell"
        isLoading={status === 'working'}
        onClick={enable}
      >
        Enable alerts
      </EuiButtonEmpty>
    </EuiToolTip>
  );
};
