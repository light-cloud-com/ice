/**
 * Scale Presets — Messaging category.
 *
 * Resource keys covered: message-queue, event-bus, rabbitmq, cloud-pubsub,
 * service-bus, event-stream.
 *
 * Part of the rf-spdat split — see `../scale-presets-data.ts` for the
 * orchestrator and `../scale-presets-types.ts` for the shared types.
 */

import type { ScaleTier, TierPreset } from '../scale-presets-types';

export const MESSAGING_PRESETS: Record<string, Partial<Record<ScaleTier, TierPreset>>> = {
  'message-queue': {
    dev: {
      retention: '1d',
      max_message_size: '256',
      dead_letter: false,
      _providers: {
        aws: { queue_type: 'standard' },
        gcp: { queue_type: 'pull' },
        azure: { queue_type: 'basic' },
      },
    },
    low: {
      retention: '4d',
      max_message_size: '256',
      dead_letter: true,
      _providers: {
        aws: { queue_type: 'standard' },
        gcp: { queue_type: 'pull' },
        azure: { queue_type: 'basic' },
      },
    },
    moderate: {
      retention: '4d',
      max_message_size: '256',
      dead_letter: true,
      _providers: {
        aws: { queue_type: 'standard' },
        gcp: { queue_type: 'pull' },
        azure: { queue_type: 'standard-azure' },
      },
    },
    medium: {
      retention: '7d',
      max_message_size: '256',
      dead_letter: true,
      _providers: {
        aws: { queue_type: 'fifo' },
        gcp: { queue_type: 'push' },
        azure: { queue_type: 'standard-azure' },
      },
    },
    high: {
      retention: '7d',
      max_message_size: '256',
      dead_letter: true,
      _providers: {
        aws: { queue_type: 'fifo-high-throughput' },
        gcp: { queue_type: 'push' },
        azure: { queue_type: 'premium' },
      },
    },
    'very-high': {
      retention: '14d',
      max_message_size: '256',
      dead_letter: true,
      _providers: {
        aws: { queue_type: 'fifo-high-throughput' },
        gcp: { queue_type: 'push' },
        azure: { queue_type: 'premium' },
      },
    },
  },

  'event-bus': {
    dev: {
      _providers: {
        aws: { topic_type: 'standard' },
        gcp: { topic_type: 'gcp-default' },
        azure: { topic_type: 'azure-standard' },
      },
    },
    low: {
      _providers: {
        aws: { topic_type: 'standard' },
        gcp: { topic_type: 'gcp-default' },
        azure: { topic_type: 'azure-standard' },
      },
    },
    moderate: {
      _providers: {
        aws: { topic_type: 'standard' },
        gcp: { topic_type: 'gcp-default' },
        azure: { topic_type: 'azure-standard' },
      },
    },
    medium: {
      _providers: {
        aws: { topic_type: 'standard' },
        gcp: { topic_type: 'gcp-default' },
        azure: { topic_type: 'azure-standard' },
      },
    },
    high: {
      _providers: {
        aws: { topic_type: 'fifo' },
        gcp: { topic_type: 'gcp-default' },
        azure: { topic_type: 'azure-standard' },
      },
    },
    'very-high': {
      _providers: {
        aws: { topic_type: 'fifo' },
        gcp: { topic_type: 'gcp-default' },
        azure: { topic_type: 'azure-standard' },
      },
    },
  },

  rabbitmq: {
    dev: {
      version: '3.13',
      keep_messages: false,
      always_available: false,
      _providers: {
        aws: { size: 'mq.t3.micro' },
        gcp: { size: 'lemur' },
        kubernetes: { size: 'k8s-1-2' },
      },
    },
    low: {
      version: '3.13',
      keep_messages: true,
      always_available: false,
      _providers: {
        aws: { size: 'mq.t3.micro' },
        gcp: { size: 'lemur' },
        kubernetes: { size: 'k8s-1-2' },
      },
    },
    moderate: {
      version: '3.13',
      keep_messages: true,
      always_available: false,
      _providers: {
        aws: { size: 'mq.m5.large' },
        gcp: { size: 'tiger' },
        kubernetes: { size: 'k8s-2-4' },
      },
    },
    medium: {
      version: '3.13',
      keep_messages: true,
      always_available: true,
      _providers: {
        aws: { size: 'mq.m5.large' },
        gcp: { size: 'tiger' },
        kubernetes: { size: 'k8s-2-4' },
      },
    },
    high: {
      version: '3.13',
      keep_messages: true,
      always_available: true,
      _providers: {
        aws: { size: 'mq.m5.xlarge' },
        gcp: { size: 'lion' },
        kubernetes: { size: 'k8s-4-8' },
      },
    },
    'very-high': {
      version: '3.13',
      keep_messages: true,
      always_available: true,
      _providers: {
        aws: { size: 'mq.m5.2xlarge' },
        gcp: { size: 'lion' },
        kubernetes: { size: 'k8s-4-8' },
      },
    },
  },

  'cloud-pubsub': {
    dev: { order_matters: false },
    low: { order_matters: false },
    moderate: { order_matters: false },
    medium: { order_matters: false },
    high: { order_matters: false },
    'very-high': { order_matters: true },
  },

  'service-bus': {
    dev: {
      _providers: { azure: { size: 'basic' } },
    },
    low: {
      _providers: { azure: { size: 'basic' } },
    },
    moderate: {
      _providers: { azure: { size: 'standard' } },
    },
    medium: {
      _providers: { azure: { size: 'standard' } },
    },
    high: {
      _providers: { azure: { size: 'premium-1' } },
    },
    'very-high': {
      _providers: { azure: { size: 'premium-2' } },
    },
  },

  'event-stream': {
    dev: {
      retention: '24h',
      _providers: {
        aws: { size: 'on-demand' },
        gcp: { size: 'gcp-default' },
        azure: { size: 'eh-basic' },
      },
    },
    low: {
      retention: '24h',
      _providers: {
        aws: { size: '1-shard' },
        gcp: { size: 'gcp-default' },
        azure: { size: 'eh-basic' },
      },
    },
    moderate: {
      retention: '72h',
      _providers: {
        aws: { size: '2-shards' },
        gcp: { size: 'gcp-default' },
        azure: { size: 'eh-standard' },
      },
    },
    medium: {
      retention: '168h',
      _providers: {
        aws: { size: '4-shards' },
        gcp: { size: 'gcp-default' },
        azure: { size: 'eh-standard-4' },
      },
    },
    high: {
      retention: '168h',
      _providers: {
        aws: { size: '10-shards' },
        gcp: { size: 'gcp-default' },
        azure: { size: 'eh-premium' },
      },
    },
    'very-high': {
      retention: '720h',
      _providers: {
        aws: { size: 'on-demand' },
        gcp: { size: 'gcp-default' },
        azure: { size: 'eh-premium' },
      },
    },
  },
};
