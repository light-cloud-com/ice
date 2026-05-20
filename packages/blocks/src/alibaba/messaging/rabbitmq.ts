import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const alibabaRabbitmqBlueprint: BlockBlueprint = createBlueprintFromResource('rabbitmq', {
  iceType: 'Messaging.RabbitMQ',
  category: 'messaging',
  name: 'Alibaba RabbitMQ',
  description: 'Alibaba Cloud AMQP. RabbitMQ message broker.',
  icon: 'List',
  providers: ['alibaba'],
  nodeDataDefaults: {
    runtime: 'RabbitMQ 3.13',
    port: 5672,
  },
});
