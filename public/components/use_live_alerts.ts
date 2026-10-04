import { useEffect, useRef } from 'react';
import { CoreStart } from '../../../../src/core/public';
import { getAttackFamily } from '../../common';
import { SwordApi } from '../api';

/**
 * In-dashboard notifications: while SWORD is open, polls for detections newer than the last one seen
 * and shows a toast (and optionally a desktop notification). FCM covers the dashboard-closed case.
 */
export function useLiveAlerts(
  api: SwordApi,
  core: CoreStart,
  enabled: boolean,
  intervalSeconds: number,
  desktop: boolean
) {
  const since = useRef<string>(new Date().toISOString());
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const { items } = await api.attacks({
          start: since.current,
          end: 'now',
          from: 0,
          size: 5,
          sortDirection: 'desc',
        });
        if (cancelled) return;
        const fresh = items.filter((i) => !seen.current.has(i.id));
        if (!fresh.length) return;
        fresh.forEach((i) => seen.current.add(i.id));
        since.current = items[0].timestamp;

        const first = fresh[0];
        const family = getAttackFamily(first.predicted_attack);
        const title =
          fresh.length > 1
            ? `${fresh.length}${fresh.length === 5 ? '+' : ''} new attacks detected`
            : `${first.predicted_attack} detected`;
        const text = `${first.predicted_attack} on ${first.agent_name || first.agent_id} from ${
          first.src_ip || 'unknown'
        }`;
        core.notifications.toasts.addDanger({ title, text, iconType: family.icon });

        if (
          desktop &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        ) {
          new Notification('ตรวจพบการโจมตี', { body: text, tag: 'sword-alert' });
        }
      } catch {
        // Transient errors are surfaced by the pages themselves.
      }
    };

    const timer = setInterval(poll, Math.max(intervalSeconds, 5) * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [api, core, enabled, intervalSeconds, desktop]);
}
