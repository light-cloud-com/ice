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
  },
  compilesTo: {
    aws: [
      { name: 'DocumentDB Cluster', type: 'aws_docdb_cluster', role: 'MongoDB-compatible' },
      { name: 'DocumentDB Instance', type: 'aws_docdb_cluster_instance' },
    ],
    gcp: [
      { name: 'Firestore Database', type: 'google_firestore_database', role: 'native mode, MongoDB-like API' },
    ],
    azure: [
      { name: 'Cosmos DB MongoDB API', type: 'azurerm_cosmosdb_account' },
    ],
  },
  relatedConcepts: ['Database.PostgreSQL', 'Database.Redis'],
};
