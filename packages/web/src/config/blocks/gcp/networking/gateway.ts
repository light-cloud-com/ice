import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpGatewayBlueprint: BlockBlueprint = createBlueprintFromResource('api-gateway', {
  blockType: 'gcp-gateway',
  category: 'networking',
  name: 'GCP API Gateway',
  description: 'Google Cloud API Gateway. Routes traffic, auth + rate limiting.',
  icon: 'GitBranch',
  providers: ['gcp'],
  nodeDataDefaults: {
    iceType: 'Network.Gateway',
  },
});
