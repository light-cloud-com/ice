import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpStaticSiteBlueprint: BlockBlueprint = createBlueprintFromResource('frontend-app', {
  iceType: 'Compute.StaticSite',
  category: 'frontend',
  name: 'GCP Static Site',
  description: 'Google Cloud Storage + CDN. React/Vue/Next.js app.',
  icon: 'Globe',
  providers: ['gcp'],
  nodeDataDefaults: {
    domain: 'example.com',
  },
});
