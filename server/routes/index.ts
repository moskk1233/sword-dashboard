
import { schema } from '@osd/config-schema'
import { IRouter } from '../../../../src/core/server';
import { SearchTotalHits } from '@opensearch-project/opensearch/api/types';
import { AttackHit, BaseBucket, TrendBucket, TrendResponse } from '../../common/types';
import { AttackResponse } from '../../common/types';

export function defineRoutes(router: IRouter) {
  router.get(
    {
      path: '/api/sword_machine_learning/attacks',
      validate: {
        query: schema.object({
          from: schema.number({ defaultValue: 0 }),
          size: schema.number({ defaultValue: 10 }),
          start: schema.maybe(schema.string()),
          end: schema.maybe(schema.string()),
        })
      },
    },
    async (context, request, response) => {
      try {
        const { from, size, start, end } = request.query;
        const client = context.core.opensearch.client.asCurrentUser;

        const result = await client.search({
          index: 'wazuh-alerts-*',
          body: {
            query: {
              bool: {
                must: [
                  { exists: { field: 'data.predicted_attack' } },
                  ...(start && end ? [{
                    range: { timestamp: { gte: start, lte: end } }
                  }] : [])
                ]
              }
            },
            sort: [{ timestamp: { order: 'desc' } }],
            from,
            size,
          }
        });

        const hits = result.body.hits.hits as AttackHit[];
        const responseBody: AttackResponse = {
          total: (result.body.hits.total as SearchTotalHits).value as number,
          items: hits.map(hit => ({
            timestamp: hit._source.timestamp,
            agent_name: hit._source.agent.name,
            predicted_attack: hit._source.data.predicted_attack,
            confidence: hit._source.data.confidence,
            src_ip: hit._source.data.src_ip,
            dest_ip: hit._source.data.dest_ip,
            dest_port: hit._source.data.dest_port,
          }))
        };
        return response.ok({
          body: responseBody
        });
      } catch (err: any) {
        return response.internalError({ body: err.message });
      }
    }
  );

  router.get(
    {
      path: '/api/sword_machine_learning/trend',
      validate: {
        query: schema.object({
          start: schema.maybe(schema.string()),
          end: schema.maybe(schema.string()),
        })
      }
    },
    async (context, request, response) => {
      try {
        const { start, end } = request.query;
        const client = context.core.opensearch.client.asCurrentUser;

        const result = await client.search({
          index: 'wazuh-alerts-*',
          body: {
            query: {
              bool: {
                must: [
                  { exists: { field: "data.predicted_attack" } },
                  {
                    range: {
                      timestamp: {
                        gte: start ?? 'now-7d',
                        lte: end ?? 'now'
                      }
                    }
                  }
                ]
              }
            },
            aggs: {
              per_day: {
                date_histogram: {
                  field: 'timestamp',
                  calendar_interval: 'day',
                  time_zone: "Asia/Bangkok"
                },
                aggs: {
                  per_type: {
                    terms: { field: 'data.predicted_attack' }
                  }
                }
              },
              top_attack: {
                terms: {
                  field: 'data.predicted_attack',
                  size: 1
                }
              },
              per_type_total: {
                terms: {
                  field: 'data.predicted_attack',
                  size: 10
                }
              }
            },
            size: 0
          }
        });

        const aggs = result.body.aggregations as {
          per_day: {
            buckets: TrendBucket[];
          },
          top_attack: {
            buckets: BaseBucket[];
          },
          per_type_total: {
            buckets: BaseBucket[];
          }
        };

        const responseBody: TrendResponse = {
          trend: aggs.per_day.buckets.map(day => ({
            date: day.key_as_string,
            count: day.doc_count,
            types: day.per_type.buckets
          })),
          topAttack: aggs.top_attack.buckets[0]?.key ?? '-',
          totalDetected: (result.body.hits.total as SearchTotalHits).value,
          overview: aggs.per_type_total.buckets.map(b => ({
            attackType: b.key,
            count: b.doc_count
          }))
        }

        return response.ok({
          body: responseBody
        });
      } catch (err: any) {
        return response.internalError({ body: err.message });
      }
    }
  );
}
