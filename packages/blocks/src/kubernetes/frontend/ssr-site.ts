import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesSsrSiteBlueprint: BlockBlueprint = createBlueprintFromResource('ssr-site', {
  iceType: 'Compute.SSRSite',
  category: 'frontend',
  name: 'Kubernetes SSR Site',
  description: 'Kubernetes Deployment. Server-rendered app (Next.js, Nuxt).',
  icon: 'Globe',
  providers: ['kubernetes'],
  nodeDataDefaults: {
    runtime: 'Next.js 14',
    port: 3000,
    image: 'myorg/ssr-app:latest',
    repository: 'myorg/ssr-app',
  },
});
