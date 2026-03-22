import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureEventStreamBlueprint: BlockBlueprint = createBlueprintFromResource(
  'event-stream',
  {
    blockType: 'azure-event-stream',
    category: 'messaging',
    name: 'Azure Event Stream',
    description: 'Azure Event Hubs. Real-time events to multiple services.',
    icon: 'Activity',
    providers: ['azure'],
    nodeDataDefaults: {
      iceType: 'Messaging.Topic',
    },
  }
);
