import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpPublicTrafficBlueprint: BlockBlueprint = createBlueprintFromResource(
  'public-traffic',
  {
    blockType: 'gcp-public-traffic',
    category: 'networking',
    name: 'GCP Public Traffic',
    description: 'Google Cloud Load Balancing. Internet entry point.',
    icon: 'Users',
    providers: ['gcp'],
    nodeDataDefaults: {
      iceType: 'Network.Internet',
      domain: 'public',
    },
  }
);
