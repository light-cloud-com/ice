import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const alibabaStaticSiteBlueprint: BlockBlueprint = createBlueprintFromResource(
  'frontend-app',
  {
    blockType: 'alibaba-static-site',
    category: 'frontend',
    name: 'Alibaba Static Site',
    description: 'Alibaba Cloud OSS + CDN. React/Vue/Next.js app.',
    icon: 'Globe',
    providers: ['alibaba'],
    nodeDataDefaults: {
      iceType: 'Application.StaticSite',
      domain: 'example.com',
    },
  }
);
