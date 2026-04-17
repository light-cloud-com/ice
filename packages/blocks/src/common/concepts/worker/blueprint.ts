import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const workerConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('worker', {
    iceType: 'Compute.Worker',
    category: 'backend',
    name: 'Worker',
    description: 'Long-running background job processor. Pulls from a queue, does slow work (video encode, ETL, image processing).',
    icon: 'Cog',
    providers: ['aws', 'gcp', 'azure', 'kubernetes'],
    nodeDataDefaults: {
      label: 'Worker',
      runtime: 'node20',
      size: '0.5-1024',
      replicas: 2,
    },
  }),
  conceptId: 'worker',
  visualFamily: 'compute',
};
