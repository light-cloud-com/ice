/**
 * Cloud Blocks — Frontend category templates.
 *
 * Templates: static-site.
 *
 * Part of the rf-cbdat split — see `../cloud-blocks-data.ts` for the
 * orchestrator and `../cloud-blocks-types.ts` for the shared types.
 */

import type { BlockTemplate } from '../cloud-blocks-types.js';

export const FRONTEND_TEMPLATES: BlockTemplate[] = [
  // -------------------------------------------------------------------------
  // Static Site Block
  // -------------------------------------------------------------------------
  {
    type: 'static-site',
    name: 'static-site',
    display_name: 'Static Site',
    description: 'Deploy a static website or SPA with global CDN distribution',
    icon: 'Globe',
    category: 'Frontend',

    default_config: {
      public: true,
    },

    expands_to: [
      {
        provider: 'aws',
        resources: [
          { type: 'object-storage', role: 'hosting' },
          { type: 'cdn', role: 'distribution', optional: true },
          { type: 'ssl-certificate', role: 'https', optional: true },
          { type: 'dns-zone', role: 'domain', optional: true },
        ],
      },
      {
        provider: 'gcp',
        resources: [
          { type: 'object-storage', role: 'hosting' },
          { type: 'cdn', role: 'distribution', optional: true },
        ],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Site Name',
        type: 'string',
        description: 'Name for your static site',
      },
      {
        name: 'framework',
        label: 'Framework',
        type: 'select',
        description: 'Frontend framework used',
        options: ['React', 'Vue', 'Next.js', 'Nuxt', 'Astro', 'Static HTML'],
        default: 'React',
      },
    ],

    optional_features: [
      {
        name: 'custom_domain',
        label: 'Custom Domain',
        description: 'Use your own domain name',
        adds_resources: ['dns-zone', 'ssl-certificate'],
      },
      {
        name: 'cdn',
        label: 'Global CDN',
        description: 'Enable CDN for faster global delivery',
        adds_resources: ['cdn'],
      },
    ],
  },
];
