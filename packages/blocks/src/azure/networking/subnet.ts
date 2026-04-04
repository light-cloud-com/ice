import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureSubnetBlueprint: BlockBlueprint = createBlueprintFromResource('subnet', {
  iceType: 'Network.Subnet',
  category: 'networking',
  name: 'Azure Subnet',
  description: 'Network subdivision inside a VNet. NSG-protected.',
  icon: 'Layers',
  providers: ['azure'],
  nodeDataDefaults: {
    behavior: 'container',
  },
});
