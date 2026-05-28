import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const objectStorageConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('object-storage', {
    iceType: 'Storage.Bucket',
    category: 'data',
    name: 'Object Storage',
    description: 'Bucket for files. Images, videos, backups, uploads. S3 / GCS / Blob.',
    icon: 'Folder',
    providers: ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean', 'ibm'],
    nodeDataDefaults: { label: 'Storage', versioning: false, publicRead: false },
  }),
  conceptId: 'object-storage',
  visualFamily: 'data',
};
