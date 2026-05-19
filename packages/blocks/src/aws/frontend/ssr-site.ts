import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsSsrSiteBlueprint: BlockBlueprint = createBlueprintFromResource('ssr-site', {
  iceType: 'Compute.SSRSite',
  category: 'frontend',
  name: 'AWS SSR Site',
  description: 'AWS ECS + CloudFront. Server-rendered app (Next.js, Nuxt).',
  icon: 'Globe',
  providers: ['aws'],
  nodeDataDefaults: {
    runtime: 'Next.js 14',
    port: 3000,
    image: '<accountId>.dkr.ecr.<region>.amazonaws.com/ssr-app:latest',
    repository: 'myorg/ssr-app',
  },
});
