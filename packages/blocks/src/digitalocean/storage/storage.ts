import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const digitaloceanStorageBlueprint: BlockBlueprint = createBlueprintFromResource('object-storage', {
  blockType: 'digitalocean-storage',
  category: 'storage',
  name: 'DigitalOcean Storage',
  description: 'DigitalOcean Spaces. Files, images, uploads.',
  icon: 'HardDrive',
  providers: ['digitalocean'],
  nodeDataDefaults: {
    iceType: 'Storage.Bucket',
  },
});
