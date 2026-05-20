import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsWorkerBlueprint: BlockBlueprint = createBlueprintFromResource('worker', {
  iceType: 'Compute.Worker',
  category: 'backend',
  name: 'AWS Worker',
  description: 'AWS ECS worker. Background jobs: image processing, emails.',
  icon: 'Cog',
  providers: ['aws'],
  nodeDataDefaults: {
    runtime: 'Node.js 20',
    replicas: 2,
  },
});
