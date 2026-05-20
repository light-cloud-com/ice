import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpMysqlBlueprint: BlockBlueprint = createBlueprintFromResource('mysql-db', {
  iceType: 'Database.MySQL',
  category: 'data',
  name: 'GCP MySQL',
  description: 'Google Cloud SQL. Relational, web-scale classic.',
  icon: 'Database',
  providers: ['gcp'],
  nodeDataDefaults: {
    runtime: 'MySQL 8.0',
    port: 3306,
    size: 'db-f1-micro',
    storage: '50 GB',
    domain: 'mysql.internal',
  },
});
