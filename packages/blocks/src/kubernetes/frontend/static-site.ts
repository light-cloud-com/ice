import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesStaticSiteBlueprint: BlockBlueprint = createBlueprintFromResource('frontend-app', {
  iceType: 'Compute.StaticSite',
  category: 'frontend',
  name: 'Kubernetes Static Site',
  description: 'Kubernetes Nginx. React/Vue/Next.js app.',
  icon: 'Globe',
  providers: ['kubernetes'],
  nodeDataDefaults: {
    domain: 'example.com',
  },
});
