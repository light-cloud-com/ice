import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const alibabaGatewayBlueprint: BlockBlueprint = createBlueprintFromResource('api-gateway', {
  blockType: 'alibaba-gateway',
  category: 'networking',
  name: 'Alibaba Gateway',
  description: 'Alibaba Cloud API Gateway. Routes traffic, auth + rate limiting.',
  icon: 'GitBranch',
  providers: ['alibaba'],
  nodeDataDefaults: {
    iceType: 'Network.Gateway',
  },
});
