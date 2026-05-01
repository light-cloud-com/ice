/**
 * Cloud Blocks — Observability category templates.
 *
 * Templates: logs.
 *
 * Part of the rf-cbdat split — see `../cloud-blocks-data.ts` for the
 * orchestrator and `../cloud-blocks-types.ts` for the shared types.
 */

import type { BlockTemplate } from '../cloud-blocks-types.js';

export const OBSERVABILITY_TEMPLATES: BlockTemplate[] = [
  // -------------------------------------------------------------------------
  // Logs Block
  // -------------------------------------------------------------------------
  {
    type: 'logs',
    name: 'logs',
    display_name: 'Logging',
    description: 'Centralized logging and monitoring (CloudWatch, Stackdriver)',
    icon: 'FileText',
    category: 'Observability',

    default_config: {
      retention_days: 30,
    },

    expands_to: [
      {
        provider: 'aws',
        resources: [{ type: 'cloudwatch-log-group', role: 'logs' }],
      },
      {
        provider: 'gcp',
        resources: [{ type: 'logging-sink', role: 'logs' }],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Log Group Name',
        type: 'string',
        description: 'Name for your log group',
      },
      {
        name: 'retention',
        label: 'Retention Period',
        type: 'select',
        description: 'How long to keep logs',
        options: ['7 days', '14 days', '30 days', '90 days', '1 year', 'Forever'],
        default: '30 days',
      },
    ],

    optional_features: [
      {
        name: 'alerts',
        label: 'Log Alerts',
        description: 'Get notified on specific log patterns',
        adds_resources: ['cloudwatch-alarm'],
      },
    ],
  },
];
