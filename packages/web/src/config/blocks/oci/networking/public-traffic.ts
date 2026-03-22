import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const ociPublicTrafficBlueprint: BlockBlueprint = createBlueprintFromResource(
  'public-traffic',
  {
    blockType: 'oci-public-traffic',
    category: 'networking',
    name: 'OCI Public Traffic',
    description: 'Oracle Cloud Load Balancer. Internet entry point.',
    icon: 'Users',
    providers: ['oci'],
    nodeDataDefaults: {
      iceType: 'Network.Internet',
      domain: 'public',
    },
  }
);
