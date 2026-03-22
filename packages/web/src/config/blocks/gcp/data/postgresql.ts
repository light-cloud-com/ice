import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpPostgresqlBlueprint: BlockBlueprint = createBlueprintFromResource('postgres-db', {
  blockType: 'gcp-postgresql',
  category: 'data',
  name: 'GCP PostgreSQL',
  description: 'Google Cloud SQL. Relational, ACID-compliant.',
  icon: 'Database',
  providers: ['gcp'],
  nodeDataDefaults: {
    iceType: 'Database.PostgreSQL',
    runtime: 'PostgreSQL 16',
    port: 5432,
    size: 'db-f1-micro',
    storage: '50 GB',
    domain: 'pg.internal',
  },
});
