import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpStaticSiteBlueprint: BlockBlueprint = createBlueprintFromResource('frontend-app', {
  iceType: 'Compute.StaticSite',
  category: 'frontend',
  name: 'GCP Static Site',
  description: 'Firebase Hosting. Free HTTPS, global CDN, custom domain. React/Vue/Next.js.',
  icon: 'Globe',
  providers: ['gcp'],
  nodeDataDefaults: {
    domain: '',
  },
});
