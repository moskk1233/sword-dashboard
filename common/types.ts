// ---------- Access control ----------

/**
 * admin = Master Administrator (all_access / sword_admin): dashboard + settings + access management.
 * soc   = SOC team member (sword_soc): read-only dashboard, must change password on first login.
 * none  = authenticated user without a SWORD role: no access.
 */
export type SwordRole = 'admin' | 'soc' | 'none';

export interface AccessInfo {
  username: string;
  role: SwordRole;
  roles: string[];
  backendRoles: string[];
  mustChangePassword: boolean;
  /** False for accounts that cannot use the self-service password API (e.g. the dashboards server user). */
  canChangePassword: boolean;
}

export interface ManagedUser {
  username: string;
  role: SwordRole;
  passwordChangedAt?: string;
  mustChangePassword: boolean;
  updatedBy?: string;
}

export interface AccessOverview {
  adminRoles: string[];
  socRoles: string[];
  installedRoles: Record<string, boolean>;
  users: ManagedUser[];
  securityApiError?: string;
  enforcePasswordChange: boolean;
}

// ---------- Attacks ----------

export interface AttackItem {
  id: string;
  index: string;
  timestamp: string;
  agent_id: string;
  agent_name: string;
  agent_ip: string;
  predicted_attack: string;
  /** Ensemble soft-vote probability of the predicted class. */
  confidence: number | null;
  /** Per-model probability of the predicted class (null when the detector does not report it). */
  dtConfidence: number | null;
  rfConfidence: number | null;
  xgbConfidence: number | null;
  src_ip: string;
  dest_ip: string;
  dest_port: string;
  rule_id: string;
  rule_level: number | null;
  rule_description: string;
  full_log?: string;
  location?: string;
}

export interface AttackResponse {
  total: number;
  items: AttackItem[];
}

// ---------- Suricata IDS alerts ----------

export interface SuricataAlert {
  id: string;
  index: string;
  timestamp: string;
  agent_id: string;
  agent_name: string;
  agent_ip: string;
  signature: string;
  category: string;
  /** Suricata alert severity: 1 (most severe) … 3 (least). */
  severity: number | null;
  action: string;
  src_ip: string;
  dest_ip: string;
  src_port: string;
  dest_port: string;
  proto: string;
  rule_id: string;
  rule_level: number | null;
  rule_description: string;
  full_log?: string;
}

export interface SuricataResponse {
  total: number;
  items: SuricataAlert[];
}

export interface CountBucket {
  key: string;
  count: number;
}

export interface TrendPoint {
  /** Bucket start (epoch ms). */
  time: number;
  type: string;
  count: number;
}

export interface DailyTop {
  date: string;
  time: number;
  type: string;
  count: number;
  total: number;
}

export interface SummaryResponse {
  total: number;
  uniqueAttackers: number;
  agentsAffected: number;
  suricataAlerts: number;
  topAttack: CountBucket | null;
  byType: CountBucket[];
  interval: 'hour' | 'day';
  trend: TrendPoint[];
  dailyTop: DailyTop[];
  topAttackers: Array<CountBucket & { lastSeen: string | null }>;
  topAgents: Array<CountBucket & { name: string }>;
  topSignatures: CountBucket[];
}

// ---------- Agents ----------

export interface AgentSummary {
  id: string;
  name: string;
  ip: string;
  detections: number;
  lastDetection: string | null;
  topAttack: string | null;
  suricataAlerts: number;
  lastEvent: string | null;
  status?: string;
  version?: string;
  os?: string;
}

export interface AgentsResponse {
  items: AgentSummary[];
  monitoringAvailable: boolean;
}

// ---------- Settings ----------

export interface FcmDeviceToken {
  label: string;
  token: string;
}

/** Firebase web app config — public values, embedded in the browser client (not secret). */
export interface FcmWebConfig {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId: string;
  appId: string;
}

export interface FcmSettings {
  enabled: boolean;
  /** Firebase service account JSON. Never returned by the API; see serviceAccountSet. */
  serviceAccount?: string | null;
  serviceAccountSet?: boolean;
  projectId?: string;
  clientEmail?: string;
  deviceTokens: FcmDeviceToken[];
  /** Web-push client registration (so SOC users can enable alerts in-browser). Public, non-secret. */
  webConfig?: FcmWebConfig;
  vapidKey?: string;
  title: string;
  body: string;
  cooldownSeconds: number;
  minConfidence: number;
  families: string[];
}

/** Web-push bootstrap sent to any SOC user so their browser can register for FCM. */
export interface FcmClientConfig {
  configured: boolean;
  webConfig?: FcmWebConfig;
  vapidKey?: string;
}

export interface DashboardSettings {
  refreshSeconds: number;
  liveToasts: boolean;
}

export interface SwordSettings {
  fcm: FcmSettings;
  dashboard: DashboardSettings;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ChannelStatus {
  sent: number;
  failed: number;
  suppressed: number;
  lastSentAt: string | null;
  lastError: string | null;
}

export interface NotifierStatus {
  running: boolean;
  intervalSeconds: number;
  lastRunAt: string | null;
  lastError: string | null;
  cursor: string | null;
  processed: number;
  fcm: ChannelStatus & { invalidTokens: string[] };
}

export interface TestResult {
  ok: boolean;
  message: string;
}
