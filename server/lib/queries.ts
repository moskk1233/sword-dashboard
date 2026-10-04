import { isIP } from 'net';
import {
  AttackItem,
  ML_FIELD,
  SuricataAlert,
  getAttackFamily,
  parseConfidence,
} from '../../common';

export interface AttackFilters {
  start: string;
  end: string;
  agents?: string[];
  types?: string[];
  ip?: string;
}

export const ATTACK_SOURCE_FIELDS = [
  'timestamp',
  'agent.id',
  'agent.name',
  'agent.ip',
  'data.predicted_attack',
  'data.confidence',
  'data.dt_confidence',
  'data.rf_confidence',
  'data.xgb_confidence',
  'data.src_ip',
  'data.dest_ip',
  'data.dest_port',
  'rule.id',
  'rule.level',
  'rule.description',
  'full_log',
  'location',
];

export const SURICATA_SOURCE_FIELDS = [
  'timestamp',
  'agent.id',
  'agent.name',
  'agent.ip',
  'data.alert.signature',
  'data.alert.category',
  'data.alert.severity',
  'data.alert.action',
  'data.src_ip',
  'data.dest_ip',
  'data.src_port',
  'data.dest_port',
  'data.proto',
  'rule.id',
  'rule.level',
  'rule.description',
  'full_log',
];

export const SORTABLE_FIELDS: Record<string, string> = {
  timestamp: 'timestamp',
  agent_name: 'agent.name',
  predicted_attack: ML_FIELD,
  confidence: 'data.confidence',
  src_ip: 'data.src_ip',
  rule_level: 'rule.level',
};

export class InvalidFilterError extends Error {}

export function timeRange(start: string, end: string) {
  return { range: { timestamp: { gte: start, lte: end } } };
}

export function attackFilterClauses(f: AttackFilters): object[] {
  const filter: object[] = [{ exists: { field: ML_FIELD } }, timeRange(f.start, f.end)];
  if (f.agents?.length) filter.push({ terms: { 'agent.id': f.agents } });
  if (f.types?.length) filter.push({ terms: { [ML_FIELD]: f.types } });
  if (f.ip) {
    const ip = f.ip.trim();
    // The IP fields may be mapped as "ip", which rejects non-IP terms with a 400.
    if (!isIP(ip)) throw new InvalidFilterError(`"${ip}" is not a valid IP address`);
    filter.push({
      bool: {
        should: [{ term: { 'data.src_ip': ip } }, { term: { 'data.dest_ip': ip } }],
        minimum_should_match: 1,
      },
    });
  }
  return filter;
}

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

export function toAttackItem(hit: { _id: string; _index: string; _source: any }): AttackItem {
  const s = hit._source ?? {};
  const data = s.data ?? {};
  const level = Number(s.rule?.level);
  const attack = str(data.predicted_attack);
  // Signature-only alerts from the agent carry confidence 0, which is "not scored", not "benign".
  const confidence = parseConfidence(data.confidence);
  return {
    id: hit._id,
    index: hit._index,
    timestamp: str(s.timestamp),
    agent_id: str(s.agent?.id),
    agent_name: str(s.agent?.name),
    agent_ip: str(s.agent?.ip),
    predicted_attack: attack,
    confidence: getAttackFamily(attack).key === 'suricata' && !confidence ? null : confidence,
    dtConfidence: parseConfidence(data.dt_confidence),
    rfConfidence: parseConfidence(data.rf_confidence),
    xgbConfidence: parseConfidence(data.xgb_confidence),
    src_ip: str(data.src_ip),
    dest_ip: str(data.dest_ip),
    dest_port: str(data.dest_port),
    rule_id: str(s.rule?.id),
    rule_level: isFinite(level) ? level : null,
    rule_description: str(s.rule?.description),
    full_log: s.full_log,
    location: s.location,
  };
}

export function toSuricataAlert(hit: {
  _id: string;
  _index: string;
  _source: any;
}): SuricataAlert {
  const s = hit._source ?? {};
  const data = s.data ?? {};
  const alert = data.alert ?? {};
  const level = Number(s.rule?.level);
  const severity = Number(alert.severity);
  return {
    id: hit._id,
    index: hit._index,
    timestamp: str(s.timestamp),
    agent_id: str(s.agent?.id),
    agent_name: str(s.agent?.name),
    agent_ip: str(s.agent?.ip),
    signature: str(alert.signature),
    category: str(alert.category),
    severity: isFinite(severity) ? severity : null,
    action: str(alert.action),
    src_ip: str(data.src_ip),
    dest_ip: str(data.dest_ip),
    src_port: str(data.src_port),
    dest_port: str(data.dest_port),
    proto: str(data.proto),
    rule_id: str(s.rule?.id),
    rule_level: isFinite(level) ? level : null,
    rule_description: str(s.rule?.description),
    full_log: s.full_log,
  };
}
