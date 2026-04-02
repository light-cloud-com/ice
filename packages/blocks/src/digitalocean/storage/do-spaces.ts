/**
 * DO Spaces Blueprint — Flat Card
 *
 * Storage.DOSpaces — S3-compatible object storage.
 */

import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const doSpacesBlueprint: BlockBlueprint = createBlueprintFromResource('do-spaces', {
  iceType: 'Storage.DOSpaces',
  category: 'storage',
  name: 'Spaces',
  description: 'DigitalOcean S3-compatible object storage.',
  icon: 'HardDrive',
  providers: ['digitalocean'],
  nodeDataDefaults: {
  },
});
