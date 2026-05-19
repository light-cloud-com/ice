import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsScalableBackendBlueprint: BlockBlueprint = createBlueprintFromResource('container-service', {
  iceType: 'Compute.Container',
  category: 'backend',
  name: 'AWS Service',
  description: 'AWS ECS/Fargate. Containerized service, auto-scales.',
  icon: 'Server',
  providers: ['aws'],
  nodeDataDefaults: {
    runtime: 'Node.js 20',
    port: 8080,
    size: '0.25-512',
    minInstances: 1,
    maxInstances: 3,
    activeInstances: 1,
    scalingMetric: 'cpu',
    scalingThreshold: 70,
  },
});
