/**
 * OCI Object Storage Blueprint — Flat Card
 *
 * Storage.OCIObjectStorage — Enterprise object storage with automatic tiering.
 */

import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const ociObjectStorageBlueprint: BlockBlueprint = createBlueprintFromResource('oci-object-storage', {
  iceType: 'Storage.OCIObjectStorage',
  category: 'storage',
  name: 'OCI Object Storage',
  description: 'Oracle Cloud enterprise object storage. Tiered.',
  icon: 'HardDrive',
  providers: ['oci'],
  nodeDataDefaults: {},
});
