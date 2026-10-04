/**
 * Attack families from the SWORD scope (DDoS, Web Attack: Brute Force / XSS / SQL Injection, Port Scanning).
 * The ML model writes free-form labels (e.g. "PortScan", "DoS", "Web Attack - Brute Force"),
 * so labels are matched to a family for colouring and filtering.
 */
export interface AttackFamily {
  key: AttackFamilyKey;
  label: string;
  color: string;
  icon: string;
  description: string;
}

export type AttackFamilyKey =
  | 'dos'
  | 'portscan'
  | 'bruteforce'
  | 'xss'
  | 'sqli'
  | 'suricata'
  | 'other';

export const ATTACK_FAMILIES: Record<AttackFamilyKey, AttackFamily> = {
  dos: {
    key: 'dos',
    label: 'DoS / DDoS',
    color: '#E7664C',
    icon: 'bolt',
    description: 'Denial of service / flooding traffic',
  },
  portscan: {
    key: 'portscan',
    label: 'Port Scanning',
    color: '#6092C0',
    icon: 'search',
    description: 'Reconnaissance of open ports',
  },
  bruteforce: {
    key: 'bruteforce',
    label: 'Brute Force',
    color: '#D6BF57',
    icon: 'lock',
    description: 'Web Attack: repeated credential guessing',
  },
  xss: {
    key: 'xss',
    label: 'Cross Site Scripting',
    color: '#D36086',
    icon: 'editorCodeBlock',
    description: 'Web Attack: script injection',
  },
  sqli: {
    key: 'sqli',
    label: 'SQL Injection',
    color: '#9170B8',
    icon: 'database',
    description: 'Web Attack: database query injection',
  },
  suricata: {
    key: 'suricata',
    label: 'Suricata Signature',
    color: '#AA6556',
    icon: 'securityApp',
    description: 'Signature match forwarded by the agent ("Suricata Alert"), no ML score',
  },
  other: {
    key: 'other',
    label: 'Other',
    color: '#54B399',
    icon: 'alert',
    description: 'Other attack labels reported by the model',
  },
};

export const ATTACK_FAMILY_KEYS = Object.keys(ATTACK_FAMILIES) as AttackFamilyKey[];

export function getAttackFamily(label: string | undefined | null): AttackFamily {
  const value = (label ?? '').toLowerCase();
  if (/suricata/.test(value)) return ATTACK_FAMILIES.suricata;
  if (/port\s*-?\s*scan/.test(value)) return ATTACK_FAMILIES.portscan;
  if (/\bd?dos\b|ddos|denial|hulk|goldeneye|slowloris|flood/.test(value))
    return ATTACK_FAMILIES.dos;
  if (/brute/.test(value)) return ATTACK_FAMILIES.bruteforce;
  if (/xss|cross\s*-?\s*site/.test(value)) return ATTACK_FAMILIES.xss;
  if (/sql/.test(value)) return ATTACK_FAMILIES.sqli;
  return ATTACK_FAMILIES.other;
}

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export function parseConfidence(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (!isFinite(n)) return null;
  // Accept both 0..1 and 0..100 representations.
  return n > 1 ? Math.min(n / 100, 1) : Math.max(n, 0);
}

export function getSeverity(confidence: number | null): Severity {
  if (confidence === null) return 'medium';
  if (confidence >= 0.9) return 'critical';
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

export const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#BD271E',
  high: '#E7664C',
  medium: '#D6BF57',
  low: '#6092C0',
};
