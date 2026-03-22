import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpSsrSiteBlueprint: BlockBlueprint = createBlueprintFromResource('ssr-site', {
  blockType: 'gcp-ssr-site',
  category: 'frontend',
  name: 'GCP SSR Site',
  description: 'Google Cloud Run. Server-rendered app (Next.js, Nuxt).',
  icon: 'Globe',
  providers: ['gcp'],
  nodeDataDefaults: {
    iceType: 'Application.SSRSite',
    runtime: 'Next.js 14',
    port: 3000,
    image: 'gcr.io/myorg/ssr-app:latest',
    repository: 'myorg/ssr-app',
  },
});
