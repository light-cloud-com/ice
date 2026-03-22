import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const ociGatewayBlueprint: BlockBlueprint = createBlueprintFromResource('api-gateway', {
  blockType: 'oci-gateway',
  category: 'networking',
  name: 'OCI API Gateway',
  description: 'Oracle Cloud API Gateway. Routes traffic, auth + rate limiting.',
  icon: 'GitBranch',
  providers: ['oci'],
  nodeDataDefaults: {
    iceType: 'Network.Gateway',
  },
});
