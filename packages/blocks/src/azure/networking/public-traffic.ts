import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azurePublicTrafficBlueprint: BlockBlueprint = createBlueprintFromResource('public-traffic', {
  iceType: 'Network.Internet',
  category: 'networking',
  name: 'Azure Public Traffic',
  description: 'Azure Front Door. Internet entry point.',
  icon: 'Users',
  providers: ['azure'],
  nodeDataDefaults: {
    domain: 'public',
  },
});
