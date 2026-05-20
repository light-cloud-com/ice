import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureStorageBlueprint: BlockBlueprint = createBlueprintFromResource('object-storage', {
  iceType: 'Storage.Bucket',
  category: 'storage',
  name: 'Azure Blob Storage',
  description: 'Azure Blob Storage. Files, images, uploads.',
  icon: 'HardDrive',
  providers: ['azure'],
  nodeDataDefaults: {
    storage_class: 'azure-hot',
  },
});
