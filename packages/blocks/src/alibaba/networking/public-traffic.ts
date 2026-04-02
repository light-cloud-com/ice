import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const alibabaPublicTrafficBlueprint: BlockBlueprint = createBlueprintFromResource('public-traffic', {
  iceType: 'Network.Internet',
  category: 'networking',
  name: 'Alibaba Public Traffic',
  description: 'Alibaba Cloud SLB. Internet entry point.',
  icon: 'Users',
  providers: ['alibaba'],
  nodeDataDefaults: {
    domain: 'public',
  },
});
