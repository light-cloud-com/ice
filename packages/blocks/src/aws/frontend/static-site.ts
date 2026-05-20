import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsStaticSiteBlueprint: BlockBlueprint = createBlueprintFromResource('frontend-app', {
  iceType: 'Compute.StaticSite',
  category: 'frontend',
  name: 'AWS Static Site',
  description: 'AWS S3 + CloudFront. React/Vue/Next.js app.',
  icon: 'Globe',
  providers: ['aws'],
  nodeDataDefaults: {
    domain: 'example.com',
  },
});
