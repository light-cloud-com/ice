import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesRabbitmqBlueprint: BlockBlueprint = createBlueprintFromResource('rabbitmq', {
  iceType: 'Messaging.RabbitMQ',
  category: 'messaging',
  name: 'Kubernetes RabbitMQ',
  description: 'Kubernetes RabbitMQ Operator. Message broker.',
  icon: 'List',
  providers: ['kubernetes'],
  nodeDataDefaults: {
    runtime: 'RabbitMQ 3.13',
    port: 5672,
  },
});
