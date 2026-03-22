import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureGatewayBlueprint: BlockBlueprint = createBlueprintFromResource('api-gateway', {
  blockType: 'azure-gateway',
  category: 'networking',
  name: 'Azure API Management',
  description: 'Azure API Management. Routes traffic, auth + rate limiting.',
  icon: 'GitBranch',
  providers: ['azure'],
  nodeDataDefaults: {
    iceType: 'Network.Gateway',
  },
});
