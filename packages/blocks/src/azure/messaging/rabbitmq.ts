import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureRabbitmqBlueprint: BlockBlueprint = createBlueprintFromResource('rabbitmq', {
  blockType: 'azure-rabbitmq',
  category: 'messaging',
  name: 'Azure RabbitMQ',
  description: 'Azure RabbitMQ on AKS. Message broker.',
  icon: 'List',
  providers: ['azure'],
  nodeDataDefaults: {
    iceType: 'Messaging.RabbitMQ',
    runtime: 'RabbitMQ 3.13',
    port: 5672,
  },
});
