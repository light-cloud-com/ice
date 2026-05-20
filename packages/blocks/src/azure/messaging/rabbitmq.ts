import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureRabbitmqBlueprint: BlockBlueprint = createBlueprintFromResource('rabbitmq', {
  iceType: 'Messaging.RabbitMQ',
  category: 'messaging',
  name: 'Azure RabbitMQ',
  description: 'Azure RabbitMQ on AKS. Message broker.',
  icon: 'List',
  providers: ['azure'],
  nodeDataDefaults: {
    runtime: 'RabbitMQ 3.13',
    port: 5672,
  },
});
