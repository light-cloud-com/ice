import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsMysqlBlueprint: BlockBlueprint = createBlueprintFromResource('mysql-db', {
  iceType: 'Database.MySQL',
  category: 'data',
  name: 'AWS MySQL',
  description: 'AWS RDS. Relational, web-scale classic.',
  icon: 'Database',
  providers: ['aws'],
  nodeDataDefaults: {
    runtime: 'MySQL 8.0',
    port: 3306,
    size: 'db.t3.medium',
    storage: '50 GB',
    domain: 'mysql.internal',
  },
});
