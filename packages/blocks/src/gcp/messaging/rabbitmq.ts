import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpRabbitmqBlueprint: BlockBlueprint = createBlueprintFromResource('rabbitmq', {
  blockType: 'gcp-rabbitmq',
  category: 'messaging',
  name: 'GCP RabbitMQ',
  description: 'Google Cloud RabbitMQ on GKE. Message broker.',
  icon: 'List',
  providers: ['gcp'],
  nodeDataDefaults: {
    iceType: 'Messaging.RabbitMQ',
    runtime: 'RabbitMQ 3.13',
    port: 5672,
  },
});
