import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsSsrSiteBlueprint: BlockBlueprint = createBlueprintFromResource('ssr-site', {
  blockType: 'aws-ssr-site',
  category: 'frontend',
  name: 'AWS SSR Site',
  description: 'AWS ECS + CloudFront. Server-rendered app (Next.js, Nuxt).',
  icon: 'Globe',
  providers: ['aws'],
  nodeDataDefaults: {
    iceType: 'Application.SSRSite',
    runtime: 'Next.js 14',
    port: 3000,
    image: 'ecr.aws/myorg/ssr-app:latest',
    repository: 'myorg/ssr-app',
  },
});
