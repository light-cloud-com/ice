import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpWorkerBlueprint: BlockBlueprint = createBlueprintFromResource('worker', {
  blockType: 'gcp-worker',
  category: 'backend',
  name: 'GCP Worker',
  description: 'Google Cloud Run Jobs. Background jobs: image processing, emails.',
  icon: 'Cog',
  providers: ['gcp'],
  nodeDataDefaults: {
    iceType: 'Application.Worker',
    runtime: 'Node.js 20',
    replicas: 2,
  },
});
