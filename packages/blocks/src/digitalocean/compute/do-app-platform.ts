/**
 * DO App Platform Blueprint — Flat Card
 *
 * Application.DOAppPlatform — DigitalOcean PaaS, git push to deploy.
 */

import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const doAppPlatformBlueprint: BlockBlueprint = createBlueprintFromResource('do-app-platform', {
  iceType: 'Compute.DOAppPlatform',
  category: 'compute',
  name: 'App Platform',
  description: 'DigitalOcean PaaS. Git push to deploy.',
  icon: 'Server',
  providers: ['digitalocean'],
  nodeDataDefaults: {
    runtime: 'Node.js',
  },
});
