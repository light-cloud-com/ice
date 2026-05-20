import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureGatewayBlueprint: BlockBlueprint = createBlueprintFromResource('api-gateway', {
  iceType: 'Network.Gateway',
  category: 'networking',
  name: 'Azure API Management',
  description: 'Azure API Management. Routes traffic, auth + rate limiting.',
  icon: 'GitBranch',
  providers: ['azure'],
  nodeDataDefaults: {
    protocol: 'azure-consumption',
  },
});
