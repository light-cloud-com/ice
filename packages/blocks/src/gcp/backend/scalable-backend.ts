import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpScalableBackendBlueprint: BlockBlueprint = createBlueprintFromResource(
  'container-service',
  {
    blockType: 'gcp-scalable-backend',
    category: 'backend',
    name: 'GCP Service',
    description: 'Google Cloud Run. Containerized service, auto-scales.',
    icon: 'Server',
    providers: ['gcp'],
    nodeDataDefaults: {
      iceType: 'Application.Container',
      runtime: 'Node.js 20',
      port: 8080,
      image: 'gcr.io/myorg/service:latest',
      repository: 'myorg/service',
      minInstances: 1,
      maxInstances: 3,
      activeInstances: 1,
      scalingMetric: 'cpu',
      scalingThreshold: 70,
    },
  }
);
