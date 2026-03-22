import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const ociStaticSiteBlueprint: BlockBlueprint = createBlueprintFromResource('frontend-app', {
  blockType: 'oci-static-site',
  category: 'frontend',
  name: 'OCI Static Site',
  description: 'Oracle Cloud Object Storage + CDN. React/Vue/Next.js app.',
  icon: 'Globe',
  providers: ['oci'],
  nodeDataDefaults: {
    iceType: 'Application.StaticSite',
    domain: 'example.com',
  },
});
