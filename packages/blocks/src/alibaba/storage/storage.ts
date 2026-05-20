import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const alibabaStorageBlueprint: BlockBlueprint = createBlueprintFromResource('object-storage', {
  iceType: 'Storage.Bucket',
  category: 'storage',
  name: 'Alibaba Storage',
  description: 'Alibaba Cloud OSS. Files, images, uploads.',
  icon: 'HardDrive',
  providers: ['alibaba'],
  nodeDataDefaults: {},
});
