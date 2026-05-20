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
    markdownZh: `
# Redis 缓存

托管的 Redis — 业界首选的内存缓存。亚毫秒级读取、pub/sub、列表、有序集合、streams。

## 适用场景

- 缓存昂贵的数据库查询
- 会话存储
- 速率限制计数器
- 作业队列后端(BullMQ、Celery、Sidekiq)
- 排行榜、实时在线状态
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
