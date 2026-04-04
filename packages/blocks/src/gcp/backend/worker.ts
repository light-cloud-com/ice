import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpWorkerBlueprint: BlockBlueprint = createBlueprintFromResource('worker', {
  iceType: 'Compute.Worker',
  category: 'backend',
  name: 'GCP Worker',
  description: 'Google Cloud Run Jobs. Background jobs: image processing, emails.',
  icon: 'Cog',
  providers: ['gcp'],
  nodeDataDefaults: {
    runtime: 'Node.js 20',
    size: 'gcp-1-512',
    replicas: 2,
  },
});
