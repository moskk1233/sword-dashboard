import { HttpSetup } from '../../../src/core/public';
import {
  API_BASE,
  AccessInfo,
  AccessOverview,
  AgentsResponse,
  AttackResponse,
  DashboardSettings,
  FcmClientConfig,
  NotifierStatus,
  SummaryResponse,
  SuricataResponse,
  SwordSettings,
  TestResult,
} from '../common';

export interface AttackQuery {
  start: string;
  end: string;
  agents?: string[];
  types?: string[];
  ip?: string;
}

/** Settings patch sent to the server. Secrets: undefined = keep, null = remove, string = replace. */
export interface SettingsPatch {
  fcm?: Partial<SwordSettings['fcm']>;
  dashboard?: Partial<DashboardSettings>;
}

const clean = (q: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(q).filter(
      ([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)
    )
  ) as any;

export function errorText(e: any): string {
  return e?.body?.message ?? e?.message ?? 'Unexpected error';
}

export class SwordApi {
  constructor(private readonly http: HttpSetup) {}

  me = () => this.http.get<AccessInfo>(`${API_BASE}/access/me`);

  uiSettings = () => this.http.get<DashboardSettings>(`${API_BASE}/ui-settings`);

  attacks = (
    q: AttackQuery & {
      from: number;
      size: number;
      sortField?: string;
      sortDirection?: 'asc' | 'desc';
    }
  ) => this.http.get<AttackResponse>(`${API_BASE}/attacks`, { query: clean({ ...q }) });

  summary = (q: AttackQuery & { interval: 'hour' | 'day'; timeZone: string }) =>
    this.http.get<SummaryResponse>(`${API_BASE}/summary`, { query: clean({ ...q }) });

  suricata = (q: AttackQuery & { from: number; size: number }) =>
    this.http.get<SuricataResponse>(`${API_BASE}/suricata`, { query: clean({ ...q }) });

  agents = (start: string, end: string) =>
    this.http.get<AgentsResponse>(`${API_BASE}/agents`, { query: { start, end } });

  settings = () => this.http.get<SwordSettings>(`${API_BASE}/settings`);

  saveSettings = (patch: SettingsPatch) =>
    this.http.put<SwordSettings>(`${API_BASE}/settings`, { body: JSON.stringify(patch) });

  testChannel = (channel: 'fcm', patch: SettingsPatch) =>
    this.http.post<TestResult>(`${API_BASE}/settings/test/${channel}`, {
      body: JSON.stringify(patch),
    });

  notifierStatus = () => this.http.get<NotifierStatus>(`${API_BASE}/notifier/status`);

  // ---- Web push (self-service for the current browser) ----
  fcmConfig = () => this.http.get<FcmClientConfig>(`${API_BASE}/fcm/config`);

  registerFcmDevice = (token: string, label?: string) =>
    this.http.post<{ ok: boolean; added: boolean }>(`${API_BASE}/fcm/register-device`, {
      body: JSON.stringify({ token, label }),
    });

  accessOverview = () => this.http.get<AccessOverview>(`${API_BASE}/access/overview`);

  requirePasswordChange = (username: string) =>
    this.http.post(
      `${API_BASE}/access/users/${encodeURIComponent(username)}/require-password-change`
    );

  socMember = (username: string, action: 'add' | 'remove') =>
    this.http.post(`${API_BASE}/access/soc-members`, {
      body: JSON.stringify({ username, action }),
    });

  installRoles = () => this.http.post(`${API_BASE}/access/roles/install`);

  changePassword = (currentPassword: string, newPassword: string) =>
    this.http.post(`${API_BASE}/account/password`, {
      body: JSON.stringify({ currentPassword, newPassword }),
    });
}
