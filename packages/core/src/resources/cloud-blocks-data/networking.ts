/**
 * Cloud Blocks — Networking category templates.
 *
 * Templates: api-gateway, cdn.
 *
 * Part of the rf-cbdat split — see `../cloud-blocks-data.ts` for the
 * orchestrator and `../cloud-blocks-types.ts` for the shared types.
 */

import type { BlockTemplate } from '../cloud-blocks-types';

export const NETWORKING_TEMPLATES: BlockTemplate[] = [
  // -------------------------------------------------------------------------
  // API Gateway Block
  // -------------------------------------------------------------------------
  {
    type: 'gateway',
    name: 'api-gateway',
    display_name: 'API Gateway',
    description: 'Managed API endpoint with routing, auth, and rate limiting',
    icon: 'GitBranch',
    category: 'Networking',

    default_config: {
      public: true,
    },

    expands_to: [
      {
        provider: 'aws',
        resources: [
          { type: 'api-gateway', role: 'gateway' },
          { type: 'ssl-certificate', role: 'https', optional: true },
        ],
      },
      {
        provider: 'gcp',
        resources: [{ type: 'api-gateway', role: 'gateway' }],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Gateway Name',
        type: 'string',
        description: 'Name for your API Gateway',
      },
      {
        name: 'protocol',
        label: 'Protocol',
        type: 'select',
        description: 'API protocol type',
        options: ['HTTP', 'WebSocket'],
        default: 'HTTP',
      },
    ],

    optional_features: [
      {
        name: 'custom_domain',
        label: 'Custom Domain',
        description: 'Use your own domain for the API',
        adds_resources: ['dns-zone', 'ssl-certificate'],
      },
      {
        name: 'auth',
        label: 'Authentication',
        description: 'Add authentication (JWT, API Key)',
        adds_resources: [],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CDN Block
  // -------------------------------------------------------------------------
  {
    type: 'cdn',
    name: 'cdn',
    display_name: 'CDN',
    description: 'Content delivery network for global distribution',
    icon: 'Globe',
    category: 'Networking',

    default_config: {},

    expands_to: [
      {
        provider: 'aws',
        resources: [
          { type: 'cloudfront-distribution', role: 'cdn' },
          { type: 'ssl-certificate', role: 'https', optional: true },
        ],
      },
      {
        provider: 'gcp',
        resources: [{ type: 'cloud-cdn', role: 'cdn' }],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Distribution Name',
        type: 'string',
        description: 'Name for your CDN distribution',
      },
      {
        name: 'origin',
        label: 'Origin Type',
        type: 'select',
        description: 'What content to serve',
        options: ['S3 Bucket', 'Load Balancer', 'Custom Origin'],
        default: 'S3 Bucket',
      },
    ],

    optional_features: [
      {
        name: 'custom_domain',
        label: 'Custom Domain',
        description: 'Use your own domain',
        adds_resources: ['dns-record', 'ssl-certificate'],
      },
    ],
  },
];
