import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const mongodbConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('mongodb', {
    iceType: 'Database.MongoDB',
    category: 'data',
    name: 'MongoDB',
    description: 'Managed document database. Flexible schema, nested documents, aggregation pipelines.',
    icon: 'Database',
    providers: ['aws', 'gcp', 'azure'],
    nodeDataDefaults: { label: 'MongoDB', version: '7.0', tier: 'small', storageGb: 20 },
  }),
  conceptId: 'mongodb',
  visualFamily: 'data',
};
