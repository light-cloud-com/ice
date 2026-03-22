import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureStaticSiteBlueprint: BlockBlueprint = createBlueprintFromResource('frontend-app', {
  blockType: 'azure-static-site',
  category: 'frontend',
  name: 'Azure Static Site',
  description: 'Azure Static Web Apps. React/Vue/Next.js app.',
  icon: 'Globe',
  providers: ['azure'],
  nodeDataDefaults: {
    iceType: 'Application.StaticSite',
    domain: 'example.com',
  },
});
