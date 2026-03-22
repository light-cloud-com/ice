import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsPostgresqlBlueprint: BlockBlueprint = createBlueprintFromResource('postgres-db', {
  blockType: 'aws-postgresql',
  category: 'data',
  name: 'AWS PostgreSQL',
  description: 'AWS RDS. Relational, ACID-compliant.',
  icon: 'Database',
  providers: ['aws'],
  nodeDataDefaults: {
    iceType: 'Database.PostgreSQL',
    runtime: 'PostgreSQL 16',
    port: 5432,
    size: 'db.t3.medium',
    storage: '50 GB',
    domain: 'pg.internal',
  },
});
