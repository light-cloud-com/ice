import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureScalableBackendBlueprint: BlockBlueprint = createBlueprintFromResource('container-service', {
  blockType: 'azure-scalable-backend',
  category: 'backend',
  name: 'Azure Service',
  description: 'Azure Container Apps. Containerized service, auto-scales.',
  icon: 'Server',
  providers: ['azure'],
  nodeDataDefaults: {
    iceType: 'Application.Container',
    runtime: 'Node.js 20',
    port: 8080,
    image: 'myorg.azurecr.io/service:latest',
    repository: 'myorg/service',
    minInstances: 1,
    maxInstances: 3,
    activeInstances: 1,
    scalingMetric: 'cpu',
    scalingThreshold: 70,
  },
});
