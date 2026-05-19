import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const dataWarehouseConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('data-warehouse', {
    iceType: 'Analytics.DataWarehouse',
    category: 'data',
    name: 'Data Warehouse',
    description: 'Columnar analytics database for large-scale queries — Redshift, BigQuery, Synapse.',
    icon: 'Warehouse',
    providers: ['aws', 'gcp', 'azure'],
    nodeDataDefaults: { label: 'Warehouse' },
  }),
  conceptId: 'data-warehouse',
  visualFamily: 'data',
};
