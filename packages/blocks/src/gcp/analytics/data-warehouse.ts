import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpDataWarehouseBlueprint: BlockBlueprint = createBlueprintFromResource(
  'data-warehouse',
  {
    blockType: 'gcp-data-warehouse',
    category: 'analytics',
    name: 'GCP Data Warehouse',
    description: 'Google BigQuery. Columnar analytics, SQL at scale.',
    icon: 'BarChart3',
    providers: ['gcp'],
    nodeDataDefaults: {
      iceType: 'Analytics.DataWarehouse',
      runtime: 'BigQuery',
      port: 443,
    },
  }
);
