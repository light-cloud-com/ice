import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesWorkerBlueprint: BlockBlueprint = createBlueprintFromResource('worker', {
  blockType: 'kubernetes-worker',
  category: 'backend',
  name: 'Kubernetes Worker',
  description: 'Kubernetes Job/CronJob. Background jobs: image processing, emails.',
  icon: 'Cog',
  providers: ['kubernetes'],
  nodeDataDefaults: {
    iceType: 'Application.Worker',
    runtime: 'Node.js 20',
    replicas: 2,
  },
});
