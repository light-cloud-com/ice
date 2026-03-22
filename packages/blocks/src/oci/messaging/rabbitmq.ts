import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const ociRabbitmqBlueprint: BlockBlueprint = createBlueprintFromResource('rabbitmq', {
  blockType: 'oci-rabbitmq',
  category: 'messaging',
  name: 'OCI RabbitMQ',
  description: 'Oracle Cloud RabbitMQ on OKE. Message broker.',
  icon: 'List',
  providers: ['oci'],
  nodeDataDefaults: {
    iceType: 'Messaging.RabbitMQ',
    runtime: 'RabbitMQ 3.13',
    port: 5672,
  },
});
