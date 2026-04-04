import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureEventStreamBlueprint: BlockBlueprint = createBlueprintFromResource('event-stream', {
  iceType: 'Messaging.Topic',
  category: 'messaging',
  name: 'Azure Event Stream',
  description: 'Azure Event Hubs. Real-time events to multiple services.',
  icon: 'Activity',
  providers: ['azure'],
  nodeDataDefaults: {
    size: 'eh-basic',
  },
});
