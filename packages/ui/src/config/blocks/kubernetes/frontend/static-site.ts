import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesStaticSiteBlueprint: BlockBlueprint = createBlueprintFromResource('frontend-app', {
  blockType: 'kubernetes-static-site',
  category: 'frontend',
  name: 'Kubernetes Static Site',
  description: 'Kubernetes Nginx. React/Vue/Next.js app.',
  icon: 'Globe',
  providers: ['kubernetes'],
  nodeDataDefaults: {
    iceType: 'Application.StaticSite',
    domain: 'example.com',
  },
});
