import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpStorageBlueprint: BlockBlueprint = createBlueprintFromResource('object-storage', {
  iceType: 'Storage.Bucket',
  category: 'storage',
  name: 'GCP Cloud Storage',
  description: 'Google Cloud Storage. Files, images, uploads.',
  icon: 'HardDrive',
  providers: ['gcp'],
  nodeDataDefaults: {
    storage_class: 'gcp-standard',
  },
});
