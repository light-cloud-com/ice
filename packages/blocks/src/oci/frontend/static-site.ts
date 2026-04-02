import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const ociStaticSiteBlueprint: BlockBlueprint = createBlueprintFromResource('frontend-app', {
  iceType: 'Compute.StaticSite',
  category: 'frontend',
  name: 'OCI Static Site',
  description: 'Oracle Cloud Object Storage + CDN. React/Vue/Next.js app.',
  icon: 'Globe',
  providers: ['oci'],
  nodeDataDefaults: {
    domain: 'example.com',
  },
});
