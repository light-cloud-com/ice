import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpStorageBlueprint: BlockBlueprint = createBlueprintFromResource('object-storage', {
  blockType: 'gcp-storage',
  category: 'storage',
  name: 'GCP Cloud Storage',
  description: 'Google Cloud Storage. Files, images, uploads.',
  icon: 'HardDrive',
  providers: ['gcp'],
  nodeDataDefaults: {
    iceType: 'Storage.Bucket',
  },
});
