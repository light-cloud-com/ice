/**
 * OSS Blueprint — Flat Card
 *
 * Storage.OSS — Alibaba Cloud object storage with China-optimized CDN.
 */

import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const ossBlueprint: BlockBlueprint = createBlueprintFromResource('oss', {
  blockType: 'oss',
  category: 'storage',
  name: 'OSS',
  description: 'Alibaba Cloud object storage. China-optimized CDN.',
  icon: 'HardDrive',
  providers: ['alibaba'],
  nodeDataDefaults: {
    iceType: 'Storage.OSS',
  },
});
