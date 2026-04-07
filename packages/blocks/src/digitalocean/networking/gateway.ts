import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const digitaloceanGatewayBlueprint: BlockBlueprint = createBlueprintFromResource('api-gateway', {
  iceType: 'Network.Gateway',
  category: 'networking',
  name: 'DigitalOcean Gateway',
  description: 'DigitalOcean App Platform routing. Routes traffic, auth + rate limiting.',
  icon: 'GitBranch',
  providers: ['digitalocean'],
  nodeDataDefaults: {},
});
