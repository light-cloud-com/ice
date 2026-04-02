import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureStaticSiteBlueprint: BlockBlueprint = createBlueprintFromResource('frontend-app', {
  iceType: 'Compute.StaticSite',
  category: 'frontend',
  name: 'Azure Static Site',
  description: 'Azure Static Web Apps. React/Vue/Next.js app.',
  icon: 'Globe',
  providers: ['azure'],
  nodeDataDefaults: {
    domain: 'example.com',
  },
});
