import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureWorkerBlueprint: BlockBlueprint = createBlueprintFromResource('worker', {
  iceType: 'Compute.Worker',
  category: 'backend',
  name: 'Azure Worker',
  description: 'Azure Container Apps worker. Background jobs: image processing, emails.',
  icon: 'Cog',
  providers: ['azure'],
  nodeDataDefaults: {
    runtime: 'Node.js 20',
    replicas: 2,
  },
});
