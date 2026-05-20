import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureDataWarehouseBlueprint: BlockBlueprint = createBlueprintFromResource('data-warehouse', {
  iceType: 'Analytics.DataWarehouse',
  category: 'analytics',
  name: 'Azure Data Warehouse',
  description: 'Azure Synapse Analytics. Columnar analytics, SQL at scale.',
  icon: 'BarChart3',
  providers: ['azure'],
  nodeDataDefaults: {
    runtime: 'Synapse Analytics',
    port: 443,
  },
});
