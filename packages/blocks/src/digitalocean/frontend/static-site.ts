import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const digitaloceanStaticSiteBlueprint: BlockBlueprint = createBlueprintFromResource(
  'frontend-app',
  {
    blockType: 'digitalocean-static-site',
    category: 'frontend',
    name: 'DigitalOcean Static Site',
    description: 'DigitalOcean App Platform. React/Vue/Next.js app.',
    icon: 'Globe',
    providers: ['digitalocean'],
    nodeDataDefaults: {
      iceType: 'Application.StaticSite',
      domain: 'example.com',
    },
  }
);
