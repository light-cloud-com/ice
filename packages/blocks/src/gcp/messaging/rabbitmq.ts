import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpRabbitmqBlueprint: BlockBlueprint = createBlueprintFromResource('rabbitmq', {
  iceType: 'Messaging.RabbitMQ',
  category: 'messaging',
  name: 'GCP RabbitMQ',
  description: 'Google Cloud RabbitMQ on GKE. Message broker.',
  icon: 'List',
  providers: ['gcp'],
  nodeDataDefaults: {
    runtime: 'RabbitMQ 3.13',
    port: 5672,
    size: 'lemur',
  },
});
