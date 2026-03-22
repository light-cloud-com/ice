import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsStaticSiteBlueprint: BlockBlueprint = createBlueprintFromResource('frontend-app', {
  blockType: 'aws-static-site',
  category: 'frontend',
  name: 'AWS Static Site',
  description: 'AWS S3 + CloudFront. React/Vue/Next.js app.',
  icon: 'Globe',
  providers: ['aws'],
  nodeDataDefaults: {
    iceType: 'Application.StaticSite',
    domain: 'example.com',
  },
});
