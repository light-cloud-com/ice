import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsSubnetBlueprint: BlockBlueprint = createBlueprintFromResource('subnet', {
  iceType: 'Network.Subnet',
  category: 'networking',
  name: 'AWS Subnet',
  description: 'Network subdivision inside a VPC. Public or private.',
  icon: 'Layers',
  providers: ['aws'],
  nodeDataDefaults: {
    behavior: 'container',
  },
});
