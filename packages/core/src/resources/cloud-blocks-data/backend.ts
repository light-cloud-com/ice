/**
 * Cloud Blocks — Backend category templates.
 *
 * Templates: scalable-backend, worker, scheduled-task.
 *
 * Part of the rf-cbdat split — see `../cloud-blocks-data.ts` for the
 * orchestrator and `../cloud-blocks-types.ts` for the shared types.
 */

import type { BlockTemplate } from '../cloud-blocks-types.js';

export const BACKEND_TEMPLATES: BlockTemplate[] = [
  // -------------------------------------------------------------------------
  // Scalable Backend Block
  // -------------------------------------------------------------------------
  {
    type: 'scalable-backend',
    name: 'scalable-backend',
    display_name: 'Scalable Backend',
    description: 'Auto-scaling API or backend service',
    icon: 'Server',
    category: 'Backend',

    default_config: {
      replicas: 2,
      min_replicas: 1,
      max_replicas: 10,
      cpu: 256,
      memory: 512,
    },

    expands_to: [
      {
        provider: 'aws',
        resources: [
          { type: 'container-service', role: 'compute' },
          { type: 'load-balancer', role: 'ingress' },
          { type: 'log-group', role: 'logging' },
        ],
      },
      {
        provider: 'gcp',
        resources: [
          { type: 'container-service', role: 'compute' },
          { type: 'load-balancer', role: 'ingress', optional: true },
        ],
      },
      {
        provider: 'kubernetes',
        resources: [
          { type: 'container-service', role: 'compute' },
          { type: 'load-balancer', role: 'ingress' },
        ],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Service Name',
        type: 'string',
        description: 'Name for your backend service',
      },
      {
        name: 'image',
        label: 'Docker Image',
        type: 'string',
        description: 'Container image to deploy',
      },
      {
        name: 'port',
        label: 'Port',
        type: 'number',
        description: 'Port the service listens on',
        default: 8080,
      },
    ],

    optional_features: [
      {
        name: 'api_gateway',
        label: 'API Gateway',
        description: 'Add API Gateway for rate limiting and auth',
        adds_resources: ['api-gateway'],
      },
      {
        name: 'auto_scaling',
        label: 'Auto Scaling',
        description: 'Scale based on traffic automatically',
        adds_resources: [],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Worker Block
  // -------------------------------------------------------------------------
  {
    type: 'worker',
    name: 'worker',
    display_name: 'Worker',
    description: 'Background job processor for async tasks',
    icon: 'Cog',
    category: 'Backend',

    default_config: {
      replicas: 1,
      cpu: 256,
      memory: 512,
    },

    expands_to: [
      {
        provider: 'aws',
        resources: [
          { type: 'container-service', role: 'worker' },
          { type: 'message-queue', role: 'job-queue', optional: true },
        ],
      },
      {
        provider: 'gcp',
        resources: [
          { type: 'container-service', role: 'worker' },
          { type: 'message-queue', role: 'job-queue', optional: true },
        ],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Worker Name',
        type: 'string',
        description: 'Name for your worker',
      },
      {
        name: 'image',
        label: 'Docker Image',
        type: 'string',
        description: 'Container image for the worker',
      },
    ],

    optional_features: [
      {
        name: 'job_queue',
        label: 'Job Queue',
        description: 'Add a message queue for job processing',
        adds_resources: ['message-queue'],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Scheduled Task Block
  // -------------------------------------------------------------------------
  {
    type: 'scheduled-task',
    name: 'scheduled-task',
    display_name: 'Scheduled Task',
    description: 'Run code on a schedule (cron jobs)',
    icon: 'Clock',
    category: 'Backend',

    default_config: {},

    expands_to: [
      {
        provider: 'aws',
        resources: [
          { type: 'serverless-function', role: 'task' },
          { type: 'scheduled-task', role: 'trigger' },
        ],
      },
      {
        provider: 'gcp',
        resources: [
          { type: 'serverless-function', role: 'task' },
          { type: 'scheduled-task', role: 'trigger' },
        ],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Task Name',
        type: 'string',
        description: 'Name for your scheduled task',
      },
      {
        name: 'schedule',
        label: 'Schedule (Cron)',
        type: 'string',
        description: 'Cron expression (e.g., "0 * * * *" for hourly)',
        default: '0 * * * *',
      },
      {
        name: 'runtime',
        label: 'Runtime',
        type: 'select',
        description: 'Programming language',
        options: ['Node.js', 'Python', 'Go'],
        default: 'Node.js',
      },
    ],

    optional_features: [],
  },
];
