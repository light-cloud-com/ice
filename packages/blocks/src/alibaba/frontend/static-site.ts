import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const alibabaStaticSiteBlueprint: BlockBlueprint = createBlueprintFromResource('frontend-app', {
  iceType: 'Compute.StaticSite',
  category: 'frontend',
  name: 'Alibaba Static Site',
  description: 'Alibaba Cloud OSS + CDN. React/Vue/Next.js app.',
  icon: 'Globe',
  providers: ['alibaba'],
  nodeDataDefaults: {
    domain: 'example.com',
  },
});
