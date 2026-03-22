import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const digitaloceanPublicTrafficBlueprint: BlockBlueprint = createBlueprintFromResource('public-traffic', {
  blockType: 'digitalocean-public-traffic',
  category: 'networking',
  name: 'DigitalOcean Public Traffic',
  description: 'DigitalOcean Load Balancer. Internet entry point.',
  icon: 'Users',
  providers: ['digitalocean'],
  nodeDataDefaults: {
    iceType: 'Network.Internet',
    domain: 'public',
  },
});
