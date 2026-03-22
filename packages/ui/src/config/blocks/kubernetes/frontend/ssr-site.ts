import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesSsrSiteBlueprint: BlockBlueprint = createBlueprintFromResource('ssr-site', {
  blockType: 'kubernetes-ssr-site',
  category: 'frontend',
  name: 'Kubernetes SSR Site',
  description: 'Kubernetes Deployment. Server-rendered app (Next.js, Nuxt).',
  icon: 'Globe',
  providers: ['kubernetes'],
  nodeDataDefaults: {
    iceType: 'Application.SSRSite',
    runtime: 'Next.js 14',
    port: 3000,
    image: 'myorg/ssr-app:latest',
    repository: 'myorg/ssr-app',
  },
});
