import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpPublicTrafficBlueprint: BlockBlueprint = createBlueprintFromResource('public-traffic', {
  iceType: 'Network.Internet',
  category: 'networking',
  name: 'GCP Public Traffic',
  description: 'Google Cloud Load Balancing. Internet entry point.',
  icon: 'Users',
  providers: ['gcp'],
  nodeDataDefaults: {
    domain: 'public',
  },
});
