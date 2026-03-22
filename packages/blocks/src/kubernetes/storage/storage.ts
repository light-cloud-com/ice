import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesStorageBlueprint: BlockBlueprint = createBlueprintFromResource(
  'object-storage',
  {
    blockType: 'kubernetes-storage',
    category: 'storage',
    name: 'Kubernetes Storage',
    description: 'Kubernetes PersistentVolume. Files, images, uploads.',
    icon: 'HardDrive',
    providers: ['kubernetes'],
    nodeDataDefaults: {
      iceType: 'Storage.Bucket',
    },
  }
);
