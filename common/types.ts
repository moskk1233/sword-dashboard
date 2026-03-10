export interface AttackSource {
  agent: AgentInfo;
  timestamp: string;
  data: AttackItem
}

export interface AttackHit {
  _source: AttackSource;
}

export interface AttackItem {
  timestamp: string;
  agent_name: string;
  predicted_attack: string;
  confidence: string;
  src_ip: string;
  dest_ip: string;
  dest_port: string;
}

export interface AttackResponse {
  total: number;
  items: AttackItem[];
}

export interface AgentInfo {
  id: string;
  ip: string;
  name: string;
}

export interface TrendBucket {
  key_as_string: string;
  doc_count: number;
  per_type: {
    buckets: Array<{ key: string; doc_count: number }>;
  };
}

export interface BaseBucket {
  key: string;
  doc_count: number;
}

export interface TrendResponse {
  trend: Array<{
    date: string;
    count: number;
    types: Array<{ key: string; doc_count: number }>;
  }>;
  topAttack: string;
  totalDetected: number;
  overview: Array<{
    attackType: string;
    count: number;
  }>;
}
export interface TrendPoint {
    date: string;
    count: number;
}

export interface OverviewItem {
  attackType: string;
  count: number;
}
