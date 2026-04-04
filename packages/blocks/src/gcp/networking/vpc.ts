import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpVpcBlueprint: BlockBlueprint = createBlueprintFromResource('vpc-network', {
  iceType: 'Network.VPC',
  category: 'networking',
  name: 'GCP VPC Network',
  description: 'Virtual Private Cloud. Isolated network for your resources.',
  icon: 'Network',
  providers: ['gcp'],
  nodeDataDefaults: {
    behavior: 'container',
  },
});
