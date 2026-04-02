/**
 * Service Bus Blueprint — Flat Card
 *
 * Messaging.ServiceBus — enterprise messaging with queues + topics.
 */

import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const serviceBusBlueprint: BlockBlueprint = createBlueprintFromResource('service-bus', {
  iceType: 'Messaging.ServiceBus',
  category: 'messaging',
  name: 'Service Bus',
  description: 'Azure enterprise messaging. Queues + topics.',
  icon: 'List',
  providers: ['azure'],
  nodeDataDefaults: {
    runtime: 'Service Bus Standard',
  },
});
