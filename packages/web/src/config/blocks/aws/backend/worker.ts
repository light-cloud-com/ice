import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsWorkerBlueprint: BlockBlueprint = createBlueprintFromResource('worker', {
  blockType: 'aws-worker',
  category: 'backend',
  name: 'AWS Worker',
  description: 'AWS ECS worker. Background jobs: image processing, emails.',
  icon: 'Cog',
  providers: ['aws'],
  nodeDataDefaults: {
    iceType: 'Application.Worker',
    runtime: 'Node.js 20',
    replicas: 2,
  },
});
