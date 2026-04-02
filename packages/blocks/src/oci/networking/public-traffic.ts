import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const ociPublicTrafficBlueprint: BlockBlueprint = createBlueprintFromResource('public-traffic', {
  iceType: 'Network.Internet',
  category: 'networking',
  name: 'OCI Public Traffic',
  description: 'Oracle Cloud Load Balancer. Internet entry point.',
  icon: 'Users',
  providers: ['oci'],
  nodeDataDefaults: {
    domain: 'public',
  },
});
