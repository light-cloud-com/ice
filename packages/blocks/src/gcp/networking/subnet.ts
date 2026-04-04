import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpSubnetBlueprint: BlockBlueprint = createBlueprintFromResource('subnet', {
  iceType: 'Network.Subnet',
  category: 'networking',
  name: 'GCP Subnetwork',
  description: 'Network subdivision inside a VPC. Regional subnet.',
  icon: 'Layers',
  providers: ['gcp'],
  nodeDataDefaults: {
    behavior: 'container',
  },
});
