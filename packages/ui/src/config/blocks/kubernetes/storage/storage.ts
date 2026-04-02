import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesStorageBlueprint: BlockBlueprint = createBlueprintFromResource('object-storage', {
  iceType: 'Storage.Bucket',
  category: 'storage',
  name: 'Kubernetes Storage',
  description: 'Kubernetes PersistentVolume. Files, images, uploads.',
  icon: 'HardDrive',
  providers: ['kubernetes'],
  nodeDataDefaults: {
  },
});
