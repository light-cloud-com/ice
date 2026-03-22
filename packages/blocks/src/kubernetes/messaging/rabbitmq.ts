import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesRabbitmqBlueprint: BlockBlueprint = createBlueprintFromResource('rabbitmq', {
  blockType: 'kubernetes-rabbitmq',
  category: 'messaging',
  name: 'Kubernetes RabbitMQ',
  description: 'Kubernetes RabbitMQ Operator. Message broker.',
  icon: 'List',
  providers: ['kubernetes'],
  nodeDataDefaults: {
    iceType: 'Messaging.RabbitMQ',
    runtime: 'RabbitMQ 3.13',
    port: 5672,
  },
});
