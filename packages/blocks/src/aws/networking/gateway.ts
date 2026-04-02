import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsGatewayBlueprint: BlockBlueprint = createBlueprintFromResource('api-gateway', {
  iceType: 'Network.Gateway',
  category: 'networking',
  name: 'AWS API Gateway',
  description: 'AWS API Gateway. Routes traffic, auth + rate limiting.',
  icon: 'GitBranch',
  providers: ['aws'],
  nodeDataDefaults: {
  },
});
