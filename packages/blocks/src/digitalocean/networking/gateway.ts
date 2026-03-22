import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const digitaloceanGatewayBlueprint: BlockBlueprint = createBlueprintFromResource(
  'api-gateway',
  {
    blockType: 'digitalocean-gateway',
    category: 'networking',
    name: 'DigitalOcean Gateway',
    description: 'DigitalOcean App Platform routing. Routes traffic, auth + rate limiting.',
    icon: 'GitBranch',
    providers: ['digitalocean'],
    nodeDataDefaults: {
      iceType: 'Network.Gateway',
    },
  }
);
