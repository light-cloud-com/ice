import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsGatewayBlueprint: BlockBlueprint = createBlueprintFromResource('api-gateway', {
  blockType: 'aws-gateway',
  category: 'networking',
  name: 'AWS API Gateway',
  description: 'AWS API Gateway. Routes traffic, auth + rate limiting.',
  icon: 'GitBranch',
  providers: ['aws'],
  nodeDataDefaults: {
    iceType: 'Network.Gateway',
  },
});
