/**
 * Cloud Blocks — Storage category templates.
 *
 * Templates: file-storage.
 *
 * Part of the rf-cbdat split — see `../cloud-blocks-data.ts` for the
 * orchestrator and `../cloud-blocks-types.ts` for the shared types.
 */

import type { BlockTemplate } from '../cloud-blocks-types';

export const STORAGE_TEMPLATES: BlockTemplate[] = [
  // -------------------------------------------------------------------------
  // File Storage Block
  // -------------------------------------------------------------------------
  {
    type: 'storage',
    name: 'file-storage',
    display_name: 'File Storage',
    description: 'Object/file storage bucket (S3, GCS)',
    icon: 'HardDrive',
    category: 'Storage',

    default_config: {
      versioning: false,
      public: false,
    },

    expands_to: [
      {
        provider: 'aws',
        resources: [{ type: 's3-bucket', role: 'storage' }],
      },
      {
        provider: 'gcp',
        resources: [{ type: 'gcs-bucket', role: 'storage' }],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Bucket Name',
        type: 'string',
        description: 'Globally unique bucket name',
      },
      {
        name: 'access',
        label: 'Access Level',
        type: 'select',
        description: 'Who can access this bucket',
        options: ['Private', 'Public Read', 'Public Read/Write'],
        default: 'Private',
      },
    ],

    optional_features: [
      {
        name: 'cdn',
        label: 'CDN Distribution',
        description: 'Serve files via CDN for faster access',
        adds_resources: ['cdn'],
      },
      {
        name: 'versioning',
        label: 'Versioning',
        description: 'Keep history of file changes',
        adds_resources: [],
      },
    ],
  },
];
