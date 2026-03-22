import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesGatewayBlueprint: BlockBlueprint = createBlueprintFromResource(
  'api-gateway',
  {
    blockType: 'kubernetes-gateway',
    category: 'networking',
    name: 'Kubernetes Gateway',
    description: 'Kubernetes Ingress. Routes traffic, auth + rate limiting.',
    icon: 'GitBranch',
    providers: ['kubernetes'],
    nodeDataDefaults: {
      iceType: 'Network.Gateway',
    },
  }
);
