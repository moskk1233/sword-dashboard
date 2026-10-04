import { isIP } from 'net';
import { schema } from '@osd/config-schema';
import { IRouter } from '../../../../src/core/server';
import {
  API_BASE,
  AgentSummary,
  AgentsResponse,
  AttackResponse,
  ML_FIELD,
  SURICATA_RULE_GROUP,
  SummaryResponse,
  SuricataResponse,
} from '../../common';
import { SwordConfig } from '../config';
import {
  ATTACK_SOURCE_FIELDS,
  SORTABLE_FIELDS,
  SURICATA_SOURCE_FIELDS,
  attackFilterClauses,
  timeRange,
  toAttackItem,
  toSuricataAlert,
} from '../lib/queries';
import { Guard } from './guard';

const listOf = schema.maybe(
  schema.oneOf([schema.string(), schema.arrayOf(schema.string(), { maxSize: 100 })])
);
const toList = (v?: string | string[]) =>
  v === undefined ? undefined : Array.isArray(v) ? v : [v];

const filterQuery = {
  start: schema.string({ defaultValue: 'now-7d' }),
  end: schema.string({ defaultValue: 'now' }),
  agents: listOf,
  types: listOf,
  ip: schema.maybe(schema.string({ maxLength: 64 })),
};

const totalOf = (hits: any): number =>
  typeof hits.total === 'number' ? hits.total : hits.total?.value ?? 0;

const suricataFilter = (start: string, end: string): object[] => [
  { term: { 'rule.groups': SURICATA_RULE_GROUP } },
  { exists: { field: 'data.alert.signature' } },
  timeRange(start, end),
];

/**
 * Data routes. Queries run with the caller's own credentials (asCurrentUser) so the indexer's
 * index permissions / document-level security still apply on top of the SWORD role check.
 */
export function registerAttackRoutes(router: IRouter, config: SwordConfig, guard: Guard) {
  const index = config.alertsIndexPattern;

  router.get(
    {
      path: `${API_BASE}/attacks`,
      validate: {
        query: schema.object({
          ...filterQuery,
          from: schema.number({ defaultValue: 0, min: 0, max: 9990 }),
          size: schema.number({ defaultValue: 20, min: 1, max: 100 }),
          sortField: schema.string({ defaultValue: 'timestamp' }),
          sortDirection: schema.oneOf([schema.literal('asc'), schema.literal('desc')], {
            defaultValue: 'desc',
          }),
        }),
      },
    },
    guard({ level: 'soc' }, async (context, request, response) => {
      const q = request.query;
      const sortField = SORTABLE_FIELDS[q.sortField] ?? 'timestamp';
      const client = context.core.opensearch.client.asCurrentUser;
      const { body } = await client.search({
        index,
        ignore_unavailable: true,
        body: {
          from: q.from,
          size: Math.min(q.size, 10000 - q.from),
          track_total_hits: true,
          _source: ATTACK_SOURCE_FIELDS,
          sort: [
            { [sortField]: { order: q.sortDirection, unmapped_type: 'keyword' } },
            ...(sortField === 'timestamp' ? [] : [{ timestamp: { order: 'desc' as const } }]),
          ],
          query: {
            bool: {
              filter: attackFilterClauses({
                ...q,
                agents: toList(q.agents),
                types: toList(q.types),
              }),
            },
          },
        },
      });
      const result: AttackResponse = {
        total: totalOf(body.hits),
        items: (body.hits.hits as any[]).map(toAttackItem),
      };
      return response.ok({ body: result });
    })
  );

  router.get(
    {
      path: `${API_BASE}/summary`,
      validate: {
        query: schema.object({
          ...filterQuery,
          timeZone: schema.string({ defaultValue: 'UTC', maxLength: 64 }),
          interval: schema.oneOf([schema.literal('hour'), schema.literal('day')], {
            defaultValue: 'day',
          }),
        }),
      },
    },
    guard({ level: 'soc' }, async (context, request, response) => {
      const q = request.query;
      const client = context.core.opensearch.client.asCurrentUser;
      const histogram = (interval: string) => ({
        field: 'timestamp',
        calendar_interval: interval,
        time_zone: q.timeZone,
        min_doc_count: 0,
        extended_bounds: { min: q.start, max: q.end },
      });

      const [ml, suricata] = await Promise.all([
        client.search({
          index,
          ignore_unavailable: true,
          body: {
            size: 0,
            track_total_hits: true,
            query: {
              bool: {
                filter: attackFilterClauses({
                  ...q,
                  agents: toList(q.agents),
                  types: toList(q.types),
                }),
              },
            },
            aggs: {
              by_type: { terms: { field: ML_FIELD, size: 20 } },
              trend: {
                date_histogram: histogram(q.interval),
                aggs: { types: { terms: { field: ML_FIELD, size: 20 } } },
              },
              daily: {
                date_histogram: { ...histogram('day'), min_doc_count: 1 },
                aggs: { top: { terms: { field: ML_FIELD, size: 1 } } },
              },
              attackers: { cardinality: { field: 'data.src_ip' } },
              agents: { cardinality: { field: 'agent.id' } },
              top_attackers: {
                terms: { field: 'data.src_ip', size: 6 },
                aggs: { last: { max: { field: 'timestamp' } } },
              },
              top_agents: {
                terms: { field: 'agent.id', size: 6 },
                aggs: { name: { terms: { field: 'agent.name', size: 1 } } },
              },
            },
          },
        }),
        client.search({
          index,
          ignore_unavailable: true,
          body: {
            size: 0,
            track_total_hits: true,
            query: {
              bool: {
                filter: [
                  ...suricataFilter(q.start, q.end),
                  ...(toList(q.agents)?.length
                    ? [{ terms: { 'agent.id': toList(q.agents) } }]
                    : []),
                ],
              },
            },
            aggs: { signatures: { terms: { field: 'data.alert.signature', size: 6 } } },
          },
        }),
      ]);

      const a = ml.body.aggregations as any;
      const byType = (a.by_type.buckets as any[]).map((b) => ({ key: b.key, count: b.doc_count }));
      const result: SummaryResponse = {
        total: totalOf(ml.body.hits),
        uniqueAttackers: a.attackers.value ?? 0,
        agentsAffected: a.agents.value ?? 0,
        suricataAlerts: totalOf(suricata.body.hits),
        topAttack: byType[0] ?? null,
        byType,
        interval: q.interval,
        trend: (a.trend.buckets as any[]).flatMap((b) =>
          (b.types.buckets as any[]).length
            ? (b.types.buckets as any[]).map((t) => ({
                time: b.key,
                type: t.key,
                count: t.doc_count,
              }))
            : [{ time: b.key, type: '', count: 0 }]
        ),
        dailyTop: (a.daily.buckets as any[])
          .filter((b) => b.top.buckets.length)
          .map((b) => ({
            date: b.key_as_string,
            time: b.key,
            type: b.top.buckets[0].key,
            count: b.top.buckets[0].doc_count,
            total: b.doc_count,
          })),
        topAttackers: (a.top_attackers.buckets as any[]).map((b) => ({
          key: b.key,
          count: b.doc_count,
          lastSeen: b.last.value_as_string ?? null,
        })),
        topAgents: (a.top_agents.buckets as any[]).map((b) => ({
          key: b.key,
          count: b.doc_count,
          name: b.name.buckets[0]?.key ?? b.key,
        })),
        topSignatures: ((suricata.body.aggregations as any).signatures.buckets as any[]).map(
          (b) => ({
            key: b.key,
            count: b.doc_count,
          })
        ),
      };
      return response.ok({ body: result });
    })
  );

  // List of Suricata (signature-based) alerts, for the drill-down from the "Suricata IDS alerts" card.
  router.get(
    {
      path: `${API_BASE}/suricata`,
      validate: {
        query: schema.object({
          ...filterQuery,
          from: schema.number({ defaultValue: 0, min: 0, max: 9990 }),
          size: schema.number({ defaultValue: 50, min: 1, max: 200 }),
        }),
      },
    },
    guard({ level: 'soc' }, async (context, request, response) => {
      const q = request.query;
      const client = context.core.opensearch.client.asCurrentUser;
      const agents = toList(q.agents);
      const ip = q.ip?.trim();
      const filter: object[] = [...suricataFilter(q.start, q.end)];
      if (agents?.length) filter.push({ terms: { 'agent.id': agents } });
      if (ip && isIP(ip)) {
        filter.push({
          bool: {
            should: [{ term: { 'data.src_ip': ip } }, { term: { 'data.dest_ip': ip } }],
            minimum_should_match: 1,
          },
        });
      }
      const { body } = await client.search({
        index,
        ignore_unavailable: true,
        body: {
          from: q.from,
          size: Math.min(q.size, 10000 - q.from),
          track_total_hits: true,
          _source: SURICATA_SOURCE_FIELDS,
          sort: [{ timestamp: { order: 'desc' as const } }],
          query: { bool: { filter } },
        },
      });
      const result: SuricataResponse = {
        total: totalOf(body.hits),
        items: (body.hits.hits as any[]).map(toSuricataAlert),
      };
      return response.ok({ body: result });
    })
  );

  router.get(
    {
      path: `${API_BASE}/agents`,
      validate: {
        query: schema.object({
          start: schema.string({ defaultValue: 'now-30d' }),
          end: schema.string({ defaultValue: 'now' }),
        }),
      },
    },
    guard({ level: 'soc' }, async (context, request, response) => {
      const { start, end } = request.query;
      const client = context.core.opensearch.client.asCurrentUser;
      const { body } = await client.search({
        index,
        ignore_unavailable: true,
        body: {
          size: 0,
          query: {
            bool: {
              filter: [timeRange(start, end)],
              should: [
                { exists: { field: ML_FIELD } },
                { term: { 'rule.groups': SURICATA_RULE_GROUP } },
              ],
              minimum_should_match: 1,
            },
          },
          aggs: {
            agents: {
              terms: { field: 'agent.id', size: 1000 },
              aggs: {
                latest: {
                  top_hits: {
                    size: 1,
                    sort: [{ timestamp: { order: 'desc' } }],
                    _source: ['agent.name', 'agent.ip', 'timestamp'],
                  },
                },
                ml: {
                  filter: { exists: { field: ML_FIELD } },
                  aggs: {
                    last: { max: { field: 'timestamp' } },
                    top: { terms: { field: ML_FIELD, size: 1 } },
                  },
                },
                suricata: { filter: { term: { 'rule.groups': SURICATA_RULE_GROUP } } },
              },
            },
          },
        },
      });

      const byId = new Map<string, AgentSummary>();
      for (const b of (body.aggregations as any).agents.buckets as any[]) {
        const latest = b.latest.hits.hits[0]?._source ?? {};
        byId.set(b.key, {
          id: b.key,
          name: latest.agent?.name ?? b.key,
          ip: latest.agent?.ip ?? '',
          detections: b.ml.doc_count,
          lastDetection: b.ml.last.value_as_string ?? null,
          topAttack: b.ml.top.buckets[0]?.key ?? null,
          suricataAlerts: b.suricata.doc_count,
          lastEvent: latest.timestamp ?? null,
        });
      }

      // Agent status comes from the Wazuh monitoring index when the caller can read it.
      let monitoringAvailable = false;
      try {
        const monitoring = await client.search({
          index: config.monitoringIndexPattern,
          ignore_unavailable: true,
          body: {
            size: 1000,
            sort: [{ timestamp: { order: 'desc' } }],
            collapse: { field: 'id' },
            _source: ['id', 'name', 'ip', 'status', 'version', 'os.name', 'os.version'],
            query: { range: { timestamp: { gte: 'now-1d' } } },
          },
        });
        for (const hit of monitoring.body.hits.hits as any[]) {
          const s = hit._source;
          if (!s?.id || s.id === '000') continue;
          monitoringAvailable = true;
          const existing = byId.get(s.id);
          byId.set(s.id, {
            id: s.id,
            name: s.name ?? existing?.name ?? s.id,
            ip: s.ip ?? existing?.ip ?? '',
            detections: existing?.detections ?? 0,
            lastDetection: existing?.lastDetection ?? null,
            topAttack: existing?.topAttack ?? null,
            suricataAlerts: existing?.suricataAlerts ?? 0,
            lastEvent: existing?.lastEvent ?? null,
            status: s.status,
            version: s.version,
            os: [s.os?.name, s.os?.version].filter(Boolean).join(' ') || undefined,
          });
        }
      } catch {
        // No access to the monitoring index or it does not exist yet.
      }

      const result: AgentsResponse = {
        items: [...byId.values()].sort(
          (x, y) => y.detections - x.detections || x.id.localeCompare(y.id)
        ),
        monitoringAvailable,
      };
      return response.ok({ body: result });
    })
  );
}
