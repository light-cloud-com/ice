import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const alibabaPublicTrafficBlueprint: BlockBlueprint = createBlueprintFromResource(
  'public-traffic',
  {
    blockType: 'alibaba-public-traffic',
    category: 'networking',
    name: 'Alibaba Public Traffic',
    description: 'Alibaba Cloud SLB. Internet entry point.',
    icon: 'Users',
    providers: ['alibaba'],
    nodeDataDefaults: {
      iceType: 'Network.Internet',
      domain: 'public',
    },
  }
);
