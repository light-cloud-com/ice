import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsDataWarehouseBlueprint: BlockBlueprint = createBlueprintFromResource(
  'data-warehouse',
  {
    blockType: 'aws-data-warehouse',
    category: 'analytics',
    name: 'AWS Data Warehouse',
    description: 'AWS Redshift. Columnar analytics, SQL at scale.',
    icon: 'BarChart3',
    providers: ['aws'],
    nodeDataDefaults: {
      iceType: 'Analytics.DataWarehouse',
      runtime: 'Redshift Serverless',
      port: 443,
    },
  }
);
