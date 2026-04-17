import type { InfoContent } from '../_shared/types';

export const redisCacheInfo: InfoContent = {
  overview: {
    markdown: `
# Redis Cache

Managed Redis — the go-to in-memory cache. Sub-millisecond reads, pub/sub,
lists, sorted sets, streams.

## When to use

- Caching expensive DB queries
- Session storage
- Rate limiting counters
- Job queue backend (BullMQ, Celery, Sidekiq)
- Leaderboards, realtime presence
    `.trim(),
  },
  compilesTo: {
    aws: [{ name: 'ElastiCache Redis', type: 'aws_elasticache_cluster' }],
    gcp: [{ name: 'Memorystore Redis', type: 'google_redis_instance' }],
    azure: [{ name: 'Azure Cache for Redis', type: 'azurerm_redis_cache' }],
    kubernetes: [{ name: 'Redis Deployment', type: 'kubernetes_deployment_v1' }],
  },
  relatedConcepts: ['Database.PostgreSQL', 'Messaging.MessageQueue'],
};
