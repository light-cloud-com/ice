/**
 * Cloud Blocks — Compute category templates.
 *
 * Templates: serverless-function.
 *
 * Part of the rf-cbdat split — see `../cloud-blocks-data.ts` for the
 * orchestrator and `../cloud-blocks-types.ts` for the shared types.
 */

import type { BlockTemplate } from '../cloud-blocks-types';

export const COMPUTE_TEMPLATES: BlockTemplate[] = [
  // -------------------------------------------------------------------------
  // Serverless Function Block
  // -------------------------------------------------------------------------
  {
    type: 'serverless-function',
    name: 'serverless-function',
    display_name: 'Serverless Function',
    description: 'Event-driven serverless compute (Lambda, Cloud Functions)',
    icon: 'Zap',
    category: 'Compute',

    default_config: {
      memory: 256,
      timeout: 30,
    },

    expands_to: [
      {
        provider: 'aws',
        resources: [
          { type: 'lambda-function', role: 'function' },
          { type: 'iam-role', role: 'execution-role' },
        ],
      },
      {
        provider: 'gcp',
        resources: [{ type: 'cloud-function', role: 'function' }],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Function Name',
        type: 'string',
        description: 'Name for your function',
      },
      {
        name: 'runtime',
        label: 'Runtime',
        type: 'select',
        description: 'Programming language runtime',
        options: ['Node.js 20', 'Python 3.12', 'Go 1.21', 'Java 21'],
        default: 'Node.js 20',
      },
      {
        name: 'trigger',
        label: 'Trigger',
        type: 'select',
        description: 'What triggers this function',
        options: ['HTTP', 'Queue', 'Schedule', 'Event'],
        default: 'HTTP',
      },
    ],

    optional_features: [],
  },
];
