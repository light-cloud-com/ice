import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const digitaloceanPublicTrafficBlueprint: BlockBlueprint = createBlueprintFromResource('public-traffic', {
  iceType: 'Network.Internet',
  category: 'networking',
  name: 'DigitalOcean Public Traffic',
  description: 'DigitalOcean Load Balancer. Internet entry point.',
  icon: 'Users',
  providers: ['digitalocean'],
  nodeDataDefaults: {
    domain: 'public',
  },
});
