import { AttackItem } from './types';

export const TEMPLATE_VARIABLES: Array<{ name: string; description: string }> = [
  { name: 'attack', description: 'Predicted attack type' },
  { name: 'confidence', description: 'Model confidence (percent)' },
  { name: 'severity', description: 'critical / high / medium / low' },
  { name: 'agent', description: 'Agent name' },
  { name: 'agent_id', description: 'Agent ID' },
  { name: 'agent_ip', description: 'Agent IP' },
  { name: 'src_ip', description: 'Attacker (source) IP' },
  { name: 'dest_ip', description: 'Victim (destination) IP' },
  { name: 'dest_port', description: 'Victim port' },
  { name: 'time', description: 'Detection time' },
  { name: 'rule_level', description: 'Wazuh rule level' },
];

export const DEFAULT_FCM_TITLE = 'ตรวจพบการโจมตี';
export const DEFAULT_FCM_BODY = 'มีการโจมตี {attack} ที่ {agent} ในขณะนี้ (จาก {src_ip})';

export const SAMPLE_ATTACK: AttackItem = {
  id: 'sample',
  index: 'sample',
  timestamp: new Date().toISOString(),
  agent_id: '002',
  agent_name: 'suricata',
  agent_ip: '192.168.44.129',
  predicted_attack: 'Brute Force',
  confidence: 0.932,
  dtConfidence: 0.95,
  rfConfidence: 0.9,
  xgbConfidence: 0.94,
  src_ip: '192.168.56.103',
  dest_ip: '192.168.56.108',
  dest_port: '80',
  rule_id: '100002',
  rule_level: 10,
  rule_description: 'ML Prediction: Brute Force',
};

export function templateValues(item: AttackItem, severity: string, timeText: string) {
  return {
    attack: item.predicted_attack || '-',
    confidence: item.confidence === null ? '-' : `${(item.confidence * 100).toFixed(1)}%`,
    severity,
    agent: item.agent_name || '-',
    agent_id: item.agent_id || '-',
    agent_ip: item.agent_ip || '-',
    src_ip: item.src_ip || '-',
    dest_ip: item.dest_ip || '-',
    dest_port: item.dest_port || '-',
    time: timeText,
    rule_level: item.rule_level === null ? '-' : String(item.rule_level),
  } as Record<string, string>;
}

/** Replaces {name} placeholders. Unknown placeholders are left untouched. */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : match
  );
}
