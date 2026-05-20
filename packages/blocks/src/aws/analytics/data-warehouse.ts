import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsDataWarehouseBlueprint: BlockBlueprint = createBlueprintFromResource('data-warehouse', {
  iceType: 'Analytics.DataWarehouse',
  category: 'analytics',
  name: 'AWS Data Warehouse',
  description: 'AWS Redshift. Columnar analytics, SQL at scale.',
  icon: 'BarChart3',
  providers: ['aws'],
  nodeDataDefaults: {
    runtime: 'Redshift Serverless',
    port: 443,
  },
});
