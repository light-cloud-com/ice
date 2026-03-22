import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const alibabaRabbitmqBlueprint: BlockBlueprint = createBlueprintFromResource('rabbitmq', {
  blockType: 'alibaba-rabbitmq',
  category: 'messaging',
  name: 'Alibaba RabbitMQ',
  description: 'Alibaba Cloud AMQP. RabbitMQ message broker.',
  icon: 'List',
  providers: ['alibaba'],
  nodeDataDefaults: {
    iceType: 'Messaging.RabbitMQ',
    runtime: 'RabbitMQ 3.13',
    port: 5672,
  },
});
