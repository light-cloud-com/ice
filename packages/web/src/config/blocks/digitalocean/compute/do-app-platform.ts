/**
 * DO App Platform Blueprint — Flat Card
 *
 * Application.DOAppPlatform — DigitalOcean PaaS, git push to deploy.
 */

import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const doAppPlatformBlueprint: BlockBlueprint = createBlueprintFromResource(
  'do-app-platform',
  {
    blockType: 'do-app-platform',
    category: 'compute',
    name: 'App Platform',
    description: 'DigitalOcean PaaS. Git push to deploy.',
    icon: 'Server',
    providers: ['digitalocean'],
    nodeDataDefaults: {
      iceType: 'Application.DOAppPlatform',
      runtime: 'Node.js',
    },
  }
);
