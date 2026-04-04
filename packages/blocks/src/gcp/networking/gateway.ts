import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpGatewayBlueprint: BlockBlueprint = createBlueprintFromResource('api-gateway', {
  iceType: 'Network.Gateway',
  category: 'networking',
  name: 'GCP API Gateway',
  description: 'Google Cloud API Gateway. Routes traffic, auth + rate limiting.',
  icon: 'GitBranch',
  providers: ['gcp'],
  nodeDataDefaults: {
    protocol: 'gcp-api-gw',
  },
});
