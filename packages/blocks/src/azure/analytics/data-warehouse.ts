import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureDataWarehouseBlueprint: BlockBlueprint = createBlueprintFromResource(
  'data-warehouse',
  {
    blockType: 'azure-data-warehouse',
    category: 'analytics',
    name: 'Azure Data Warehouse',
    description: 'Azure Synapse Analytics. Columnar analytics, SQL at scale.',
    icon: 'BarChart3',
    providers: ['azure'],
    nodeDataDefaults: {
      iceType: 'Analytics.DataWarehouse',
      runtime: 'Synapse Analytics',
      port: 443,
    },
  }
);
