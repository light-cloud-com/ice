/**
 * Service Bus Blueprint — Flat Card
 *
 * Messaging.ServiceBus — enterprise messaging with queues + topics.
 */

import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const serviceBusBlueprint: BlockBlueprint = createBlueprintFromResource('service-bus', {
  blockType: 'service-bus',
  category: 'messaging',
  name: 'Service Bus',
  description: 'Azure enterprise messaging. Queues + topics.',
  icon: 'List',
  providers: ['azure'],
  nodeDataDefaults: {
    iceType: 'Messaging.ServiceBus',
    runtime: 'Service Bus Standard',
  },
});
