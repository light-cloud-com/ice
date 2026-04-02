import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesGatewayBlueprint: BlockBlueprint = createBlueprintFromResource('api-gateway', {
  iceType: 'Network.Gateway',
  category: 'networking',
  name: 'Kubernetes Gateway',
  description: 'Kubernetes Ingress. Routes traffic, auth + rate limiting.',
  icon: 'GitBranch',
  providers: ['kubernetes'],
  nodeDataDefaults: {
  },
});
