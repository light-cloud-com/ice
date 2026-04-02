import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesPublicTrafficBlueprint: BlockBlueprint = createBlueprintFromResource('public-traffic', {
  iceType: 'Network.Internet',
  category: 'networking',
  name: 'Kubernetes Public Traffic',
  description: 'Kubernetes LoadBalancer Service. Internet entry point.',
  icon: 'Users',
  providers: ['kubernetes'],
  nodeDataDefaults: {
    domain: 'public',
  },
});
