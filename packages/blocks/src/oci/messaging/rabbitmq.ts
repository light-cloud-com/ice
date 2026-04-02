import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const ociRabbitmqBlueprint: BlockBlueprint = createBlueprintFromResource('rabbitmq', {
  iceType: 'Messaging.RabbitMQ',
  category: 'messaging',
  name: 'OCI RabbitMQ',
  description: 'Oracle Cloud RabbitMQ on OKE. Message broker.',
  icon: 'List',
  providers: ['oci'],
  nodeDataDefaults: {
    runtime: 'RabbitMQ 3.13',
    port: 5672,
  },
});
