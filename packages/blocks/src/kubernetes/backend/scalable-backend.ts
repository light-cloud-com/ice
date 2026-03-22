import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesScalableBackendBlueprint: BlockBlueprint = createBlueprintFromResource(
  'container-service',
  {
    blockType: 'kubernetes-scalable-backend',
    category: 'backend',
    name: 'Kubernetes Service',
    description: 'Kubernetes Deployment + HPA. Containerized service, auto-scales.',
    icon: 'Server',
    providers: ['kubernetes'],
    nodeDataDefaults: {
      iceType: 'Application.Container',
      runtime: 'Node.js 20',
      port: 8080,
      image: 'myorg/service:latest',
      repository: 'myorg/service',
      minInstances: 1,
      maxInstances: 3,
      activeInstances: 1,
      scalingMetric: 'cpu',
      scalingThreshold: 70,
    },
  }
);
