import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsStorageBlueprint: BlockBlueprint = createBlueprintFromResource('object-storage', {
  blockType: 'aws-storage',
  category: 'storage',
  name: 'AWS S3',
  description: 'AWS S3. Files, images, uploads.',
  icon: 'HardDrive',
  providers: ['aws'],
  nodeDataDefaults: {
    iceType: 'Storage.Bucket',
  },
});
