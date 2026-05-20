import type { InfoContent } from '../_shared/types';

export const mongodbInfo: InfoContent = {
  overview: {
    markdown: `
# MongoDB

Managed document store. Schemas are flexible (documents are JSON), queries
are expressive, and horizontal sharding is first-class.

## When to use

- Rapid schema evolution, no migrations
- Nested / hierarchical data that's awkward in SQL
- Content systems, product catalogs, event logs

## When NOT to use

- Strong multi-document transactions → **Postgres**
- Tiny / cheap key-value → **Redis Cache**
    `.trim(),
    markdownZh: `
# MongoDB

托管的文档存储。模式灵活(文档即 JSON),查询表达力强,横向分片是一等公民。

## 适用场景

- 快速演化的数据模式,无需迁移
- 在 SQL 中不便处理的嵌套 / 层级数据
- 内容系统、产品目录、事件日志

## 不适用场景

- 强一致的跨文档事务 → **Postgres**
- 微型 / 低成本键值存储 → **Redis 缓存**
    `.trim(),
  },
  compilesTo: {
    aws: [
      { name: 'DocumentDB Cluster', type: 'aws_docdb_cluster', role: 'MongoDB-compatible' },
      { name: 'DocumentDB Instance', type: 'aws_docdb_cluster_instance' },
    ],
    gcp: [{ name: 'Firestore Database', type: 'google_firestore_database', role: 'native mode, MongoDB-like API' }],
    azure: [{ name: 'Cosmos DB MongoDB API', type: 'azurerm_cosmosdb_account' }],
  },
  relatedConcepts: ['Database.PostgreSQL', 'Database.Redis'],
};
