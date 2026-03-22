import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsRabbitmqBlueprint: BlockBlueprint = createBlueprintFromResource('rabbitmq', {
  blockType: 'aws-rabbitmq',
  category: 'messaging',
  name: 'AWS RabbitMQ',
  description: 'AWS Amazon MQ. RabbitMQ message broker.',
  icon: 'List',
  providers: ['aws'],
  nodeDataDefaults: {
    iceType: 'Messaging.RabbitMQ',
    runtime: 'RabbitMQ 3.13',
    port: 5672,
  },
});
