/**
 * Cloud Blocks — Messaging category templates.
 *
 * Templates: event-stream, queue.
 *
 * Part of the rf-cbdat split — see `../cloud-blocks-data.ts` for the
 * orchestrator and `../cloud-blocks-types.ts` for the shared types.
 */

import type { BlockTemplate } from '../cloud-blocks-types.js';

export const MESSAGING_TEMPLATES: BlockTemplate[] = [
  // -------------------------------------------------------------------------
  // Event Stream Block
  // -------------------------------------------------------------------------
  {
    type: 'event-stream',
    name: 'event-stream',
    display_name: 'Event Stream',
    description: 'Event streaming for real-time data pipelines (Kafka, Kinesis)',
    icon: 'Activity',
    category: 'Messaging',

    default_config: {},

    expands_to: [
      {
        provider: 'aws',
        resources: [{ type: 'kinesis-stream', role: 'stream' }],
      },
      {
        provider: 'gcp',
        resources: [{ type: 'dataflow', role: 'stream' }],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Stream Name',
        type: 'string',
        description: 'Name for your event stream',
      },
      {
        name: 'shards',
        label: 'Shards',
        type: 'number',
        description: 'Number of shards for throughput',
        default: 1,
      },
    ],

    optional_features: [],
  },

  // -------------------------------------------------------------------------
  // Queue Block
  // -------------------------------------------------------------------------
  {
    type: 'queue',
    name: 'queue',
    display_name: 'Message Queue',
    description: 'Message queue for async task processing (SQS, Pub/Sub)',
    icon: 'Inbox',
    category: 'Messaging',

    default_config: {},

    expands_to: [
      {
        provider: 'aws',
        resources: [{ type: 'sqs-queue', role: 'queue' }],
      },
      {
        provider: 'gcp',
        resources: [{ type: 'pubsub-topic', role: 'queue' }],
      },
    ],

    required_inputs: [
      {
        name: 'name',
        label: 'Queue Name',
        type: 'string',
        description: 'Name for your message queue',
      },
      {
        name: 'type',
        label: 'Queue Type',
        type: 'select',
        description: 'Type of queue',
        options: ['Standard', 'FIFO'],
        default: 'Standard',
      },
    ],

    optional_features: [
      {
        name: 'dead_letter',
        label: 'Dead Letter Queue',
        description: 'Add a dead letter queue for failed messages',
        adds_resources: ['sqs-queue'],
      },
    ],
  },
];
