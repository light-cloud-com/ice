import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const ociStorageBlueprint: BlockBlueprint = createBlueprintFromResource('object-storage', {
  blockType: 'oci-storage',
  category: 'storage',
  name: 'OCI Object Storage',
  description: 'Oracle Cloud Object Storage. Files, images, uploads.',
  icon: 'HardDrive',
  providers: ['oci'],
  nodeDataDefaults: {
    iceType: 'Storage.Bucket',
  },
});
