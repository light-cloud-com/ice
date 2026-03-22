import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpStaticSiteBlueprint: BlockBlueprint = createBlueprintFromResource('frontend-app', {
  blockType: 'gcp-static-site',
  category: 'frontend',
  name: 'GCP Static Site',
  description: 'Google Cloud Storage + CDN. React/Vue/Next.js app.',
  icon: 'Globe',
  providers: ['gcp'],
  nodeDataDefaults: {
    iceType: 'Application.StaticSite',
    domain: 'example.com',
  },
});
