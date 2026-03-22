import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsScalableBackendBlueprint: BlockBlueprint = createBlueprintFromResource(
  'container-service',
  {
    blockType: 'aws-scalable-backend',
    category: 'backend',
    name: 'AWS Service',
    description: 'AWS ECS/Fargate. Containerized service, auto-scales.',
    icon: 'Server',
    providers: ['aws'],
    nodeDataDefaults: {
      iceType: 'Application.Container',
      runtime: 'Node.js 20',
      port: 8080,
      image: 'ecr.aws/myorg/service:latest',
      repository: 'myorg/service',
      minInstances: 1,
      maxInstances: 3,
      activeInstances: 1,
      scalingMetric: 'cpu',
      scalingThreshold: 70,
    },
  }
);
