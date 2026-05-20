import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsVpcBlueprint: BlockBlueprint = createBlueprintFromResource('vpc-network', {
  iceType: 'Network.VPC',
  category: 'networking',
  name: 'AWS VPC',
  description: 'Virtual Private Cloud. Isolated network for your resources.',
  icon: 'Network',
  providers: ['aws'],
  nodeDataDefaults: {
    behavior: 'container',
  },
});
