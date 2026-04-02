import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azurePostgresqlBlueprint: BlockBlueprint = createBlueprintFromResource('postgres-db', {
  iceType: 'Database.PostgreSQL',
  category: 'data',
  name: 'Azure PostgreSQL',
  description: 'Azure Database for PostgreSQL. Relational, ACID-compliant.',
  icon: 'Database',
  providers: ['azure'],
  nodeDataDefaults: {
    runtime: 'PostgreSQL 16',
    port: 5432,
    size: 'B_Standard_B1ms',
    storage: '50 GB',
    domain: 'pg.internal',
  },
});
