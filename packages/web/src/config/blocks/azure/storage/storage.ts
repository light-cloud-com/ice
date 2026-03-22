import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureStorageBlueprint: BlockBlueprint = createBlueprintFromResource('object-storage', {
  blockType: 'azure-storage',
  category: 'storage',
  name: 'Azure Blob Storage',
  description: 'Azure Blob Storage. Files, images, uploads.',
  icon: 'HardDrive',
  providers: ['azure'],
  nodeDataDefaults: {
    iceType: 'Storage.Bucket',
  },
});
