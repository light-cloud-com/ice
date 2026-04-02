import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureSsrSiteBlueprint: BlockBlueprint = createBlueprintFromResource('ssr-site', {
  iceType: 'Compute.SSRSite',
  category: 'frontend',
  name: 'Azure SSR Site',
  description: 'Azure Container Apps. Server-rendered app (Next.js, Nuxt).',
  icon: 'Globe',
  providers: ['azure'],
  nodeDataDefaults: {
    runtime: 'Next.js 14',
    port: 3000,
    image: 'myorg.azurecr.io/ssr-app:latest',
    repository: 'myorg/ssr-app',
  },
});
