import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const serverlessFunctionConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('serverless-function', {
    iceType: 'Compute.ServerlessFunction',
    category: 'compute',
    name: 'Serverless Function',
    description: 'Event-driven function that scales to zero. Triggered by HTTP, pub/sub, storage events, or schedules.',
    icon: 'Zap',
    providers: ['aws', 'gcp', 'azure'],
    nodeDataDefaults: {
      label: 'Function',
      runtime: 'node20',
      memory: 256,
      timeout: 30,
      trigger: 'http',
    },
  }),
  conceptId: 'serverless-function',
  visualFamily: 'compute',
};
