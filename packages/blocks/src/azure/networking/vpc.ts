import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureVpcBlueprint: BlockBlueprint = createBlueprintFromResource('vpc-network', {
  iceType: 'Network.VPC',
  category: 'networking',
  name: 'Azure Virtual Network',
  description: 'Virtual Network (VNet). Isolated network for your resources.',
  icon: 'Network',
  providers: ['azure'],
  nodeDataDefaults: {
    behavior: 'container',
  },
});
