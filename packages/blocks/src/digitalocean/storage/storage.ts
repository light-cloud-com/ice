import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const digitaloceanStorageBlueprint: BlockBlueprint = createBlueprintFromResource('object-storage', {
  iceType: 'Storage.Bucket',
  category: 'storage',
  name: 'DigitalOcean Storage',
  description: 'DigitalOcean Spaces. Files, images, uploads.',
  icon: 'HardDrive',
  providers: ['digitalocean'],
  nodeDataDefaults: {},
});
