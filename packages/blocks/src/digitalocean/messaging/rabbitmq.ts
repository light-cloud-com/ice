import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const digitaloceanRabbitmqBlueprint: BlockBlueprint = createBlueprintFromResource('rabbitmq', {
  iceType: 'Messaging.RabbitMQ',
  category: 'messaging',
  name: 'DigitalOcean RabbitMQ',
  description: 'DigitalOcean Droplet RabbitMQ. Message broker.',
  icon: 'List',
  providers: ['digitalocean'],
  nodeDataDefaults: {
    runtime: 'RabbitMQ 3.13',
    port: 5672,
  },
});
