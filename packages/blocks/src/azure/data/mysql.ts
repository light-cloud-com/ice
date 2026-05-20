import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureMysqlBlueprint: BlockBlueprint = createBlueprintFromResource('mysql-db', {
  iceType: 'Database.MySQL',
  category: 'data',
  name: 'Azure MySQL',
  description: 'Azure Database for MySQL. Relational, web-scale classic.',
  icon: 'Database',
  providers: ['azure'],
  nodeDataDefaults: {
    runtime: 'MySQL 8.0',
    port: 3306,
    size: 'B_Standard_B1ms',
    storage: '50 GB',
    domain: 'mysql.internal',
  },
});
