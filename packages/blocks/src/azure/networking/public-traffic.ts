import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const azurePublicTrafficBlueprint: BlockBlueprint = createBlueprintFromResource(
  'public-traffic',
  {
    blockType: 'azure-public-traffic',
    category: 'networking',
    name: 'Azure Public Traffic',
    description: 'Azure Front Door. Internet entry point.',
    icon: 'Users',
    providers: ['azure'],
    nodeDataDefaults: {
      iceType: 'Network.Internet',
      domain: 'public',
    },
  }
);
