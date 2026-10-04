import {
  ISavedObjectsRepository,
  Logger,
  OpenSearchClient,
  SavedObjectsErrorHelpers,
} from '../../../../src/core/server';
import {
  AttackItem,
  ChannelStatus,
  ML_FIELD,
  NOTIFIER_SO_ID,
  NOTIFIER_SO_TYPE,
  NotifierStatus,
  TestResult,
  getAttackFamily,
  getSeverity,
  renderTemplate,
  templateValues,
} from '../../common';
import { SwordConfig } from '../config';
import { FcmClient, FcmTokenInvalidError } from './fcm';
import { ATTACK_SOURCE_FIELDS, toAttackItem } from './queries';
import { ResolvedSettings, SettingsStore } from './settings_store';

const PAGE_SIZE = 200;
const MAX_PAGES_PER_TICK = 5;

const emptyChannel = (): ChannelStatus => ({
  sent: 0,
  failed: 0,
  suppressed: 0,
  lastSentAt: null,
  lastError: null,
});

interface Deps {
  logger: Logger;
  config: SwordConfig;
  getClient: () => OpenSearchClient;
  getRepository: () => ISavedObjectsRepository;
  settings: SettingsStore;
}

interface ChannelFilter {
  minConfidence: number;
  families: string[];
}

/**
 * Server-side notifier (Wazuh Manager side): polls the Wazuh indexer for new ML detections from every
 * agent and fans them out to Firebase Cloud Messaging, with per-incident cooldown
 * (agent + attacker IP + attack type).
 */
export class Notifier {
  private timer?: NodeJS.Timeout;
  private busy = false;
  private cursor: string | null = null;
  private seenAtCursor = new Set<string>();
  private readonly lastSent = new Map<string, number>();
  private readonly fcm = new FcmClient();
  private readonly status: NotifierStatus;

  constructor(private readonly deps: Deps) {
    this.status = {
      running: false,
      intervalSeconds: deps.config.notifier.intervalSeconds,
      lastRunAt: null,
      lastError: null,
      cursor: null,
      processed: 0,
      fcm: { ...emptyChannel(), invalidTokens: [] },
    };
  }

  start() {
    if (!this.deps.config.notifier.enabled) {
      this.deps.logger.info('Notifier disabled by configuration');
      return;
    }
    this.status.running = true;
    this.timer = setInterval(() => this.tick(), this.deps.config.notifier.intervalSeconds * 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.status.running = false;
  }

  getStatus(): NotifierStatus {
    return { ...this.status, cursor: this.cursor };
  }

  private async loadCursor(): Promise<string | null> {
    try {
      const so = await this.deps
        .getRepository()
        .get<{ cursor: string }>(NOTIFIER_SO_TYPE, NOTIFIER_SO_ID);
      return so.attributes.cursor ?? null;
    } catch (e) {
      if (SavedObjectsErrorHelpers.isNotFoundError(e as Error)) return null;
      throw e;
    }
  }

  private async saveCursor(cursor: string) {
    await this.deps
      .getRepository()
      .create(NOTIFIER_SO_TYPE, { cursor }, { id: NOTIFIER_SO_ID, overwrite: true });
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const settings = await this.deps.settings.getResolved();
      const active = settings.fcm.enabled && settings.fcm.serviceAccount;
      if (!active) {
        // Nothing to deliver: move the cursor forward so enabling a channel later does not
        // replay a backlog of old detections.
        this.cursor = new Date().toISOString();
        this.seenAtCursor.clear();
        return;
      }
      if (!this.cursor) this.cursor = (await this.loadCursor()) ?? new Date().toISOString();
      const startCursor = this.cursor;

      for (let page = 0; page < MAX_PAGES_PER_TICK; page++) {
        const items = await this.fetchSince(this.cursor);
        const fresh = items.filter((i) => !this.seenAtCursor.has(i.id));
        for (const item of fresh) await this.dispatch(item, settings);
        this.status.processed += fresh.length;

        if (items.length) {
          const last = items[items.length - 1].timestamp;
          if (last !== this.cursor) this.seenAtCursor.clear();
          this.cursor = last;
          items.filter((i) => i.timestamp === last).forEach((i) => this.seenAtCursor.add(i.id));
        }
        if (items.length < PAGE_SIZE || fresh.length === 0) break;
      }

      if (this.cursor !== startCursor) await this.saveCursor(this.cursor);
      this.pruneCooldowns(settings);
      this.status.lastError = null;
    } catch (e) {
      this.status.lastError = (e as Error).message;
      this.deps.logger.warn(`Notifier run failed: ${(e as Error).message}`);
    } finally {
      this.status.lastRunAt = new Date().toISOString();
      this.busy = false;
    }
  }

  private async fetchSince(cursor: string): Promise<AttackItem[]> {
    const { body } = await this.deps.getClient().search({
      index: this.deps.config.alertsIndexPattern,
      ignore_unavailable: true,
      body: {
        size: PAGE_SIZE,
        _source: ATTACK_SOURCE_FIELDS,
        sort: [{ timestamp: { order: 'asc' } }],
        query: {
          bool: {
            filter: [{ exists: { field: ML_FIELD } }, { range: { timestamp: { gte: cursor } } }],
          },
        },
      },
    });
    return (body.hits.hits as any[]).map(toAttackItem);
  }

  private passes(item: AttackItem, filter: ChannelFilter) {
    if (item.confidence !== null && item.confidence < filter.minConfidence) return false;
    if (
      filter.families.length &&
      !filter.families.includes(getAttackFamily(item.predicted_attack).key)
    ) {
      return false;
    }
    return true;
  }

  /** Per-incident cooldown: the same agent/attacker/attack combination is only notified once per window. */
  private coolingDown(channel: string, item: AttackItem, cooldownSeconds: number) {
    const key = `${channel}|${item.agent_id}|${item.src_ip}|${item.predicted_attack}`;
    const now = Date.now();
    const last = this.lastSent.get(key);
    if (last !== undefined && now - last < cooldownSeconds * 1000) return true;
    this.lastSent.set(key, now);
    return false;
  }

  private pruneCooldowns(settings: ResolvedSettings) {
    const maxAge = Math.max(settings.fcm.cooldownSeconds, 60) * 1000;
    const now = Date.now();
    for (const [key, at] of this.lastSent) if (now - at > maxAge) this.lastSent.delete(key);
  }

  private formatTime(timestamp: string) {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return timestamp;
    try {
      return date.toLocaleString('en-GB', { timeZone: this.deps.config.notifier.timeZone });
    } catch {
      return date.toISOString();
    }
  }

  private values(item: AttackItem) {
    return templateValues(item, getSeverity(item.confidence), this.formatTime(item.timestamp));
  }

  private async dispatch(item: AttackItem, settings: ResolvedSettings) {
    const { fcm } = settings;
    if (
      fcm.enabled &&
      fcm.serviceAccount &&
      this.passes(item, fcm) &&
      !this.coolingDown('fcm', item, fcm.cooldownSeconds)
    ) {
      await this.deliverFcm(settings, item);
    }
  }

  private async deliverFcm(settings: ResolvedSettings, item: AttackItem) {
    const { fcm } = settings;
    const status = this.status.fcm;
    const values = this.values(item);
    const notification = {
      title: renderTemplate(fcm.title, values),
      body: renderTemplate(fcm.body, values),
    };
    const data: Record<string, string> = {
      source: 'sword',
      attack: item.predicted_attack,
      agent: item.agent_name,
      agent_id: item.agent_id,
      src_ip: item.src_ip,
      dest_ip: item.dest_ip,
      dest_port: item.dest_port,
      confidence: values.confidence,
      timestamp: item.timestamp,
    };
    for (const device of fcm.deviceTokens) {
      try {
        await this.fcm.send(fcm.serviceAccount!, device.token, notification, data);
        status.sent++;
        status.lastSentAt = new Date().toISOString();
        status.invalidTokens = status.invalidTokens.filter((l) => l !== device.label);
      } catch (e) {
        status.failed++;
        status.lastError = `${device.label}: ${(e as Error).message}`;
        if (e instanceof FcmTokenInvalidError && !status.invalidTokens.includes(device.label)) {
          status.invalidTokens.push(device.label);
        }
      }
    }
  }

  // ---------- Manual tests from the settings page ----------

  async testFcm(settings: ResolvedSettings, item: AttackItem): Promise<TestResult> {
    const { fcm } = settings;
    if (!fcm.serviceAccount) return { ok: false, message: 'Firebase service account is not set' };
    if (!fcm.deviceTokens.length)
      return { ok: false, message: 'Add at least one FCM device token' };
    const values = this.values(item);
    const errors: string[] = [];
    for (const device of fcm.deviceTokens) {
      try {
        await this.fcm.send(
          fcm.serviceAccount,
          device.token,
          {
            title: `[TEST] ${renderTemplate(fcm.title, values)}`,
            body: renderTemplate(fcm.body, values),
          },
          { source: 'sword', test: 'true' }
        );
      } catch (e) {
        errors.push(`${device.label}: ${(e as Error).message}`);
      }
    }
    return errors.length
      ? { ok: false, message: errors.join('\n') }
      : { ok: true, message: `Sent to ${fcm.deviceTokens.length} device(s)` };
  }
}
