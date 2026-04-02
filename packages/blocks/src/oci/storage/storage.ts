import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const ociStorageBlueprint: BlockBlueprint = createBlueprintFromResource('object-storage', {
  iceType: 'Storage.Bucket',
  category: 'storage',
  name: 'OCI Object Storage',
  description: 'Oracle Cloud Object Storage. Files, images, uploads.',
  icon: 'HardDrive',
  providers: ['oci'],
  nodeDataDefaults: {
  },
});
