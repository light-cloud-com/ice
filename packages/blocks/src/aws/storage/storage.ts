import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsStorageBlueprint: BlockBlueprint = createBlueprintFromResource('object-storage', {
  iceType: 'Storage.Bucket',
  category: 'storage',
  name: 'AWS S3',
  description: 'AWS S3. Files, images, uploads.',
  icon: 'HardDrive',
  providers: ['aws'],
  nodeDataDefaults: {
  },
});
