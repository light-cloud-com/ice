import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const alibabaEventStreamBlueprint: BlockBlueprint = createBlueprintFromResource(
  'event-stream',
  {
    blockType: 'alibaba-event-stream',
    category: 'messaging',
    name: 'Alibaba Event Stream',
    description: 'Alibaba Cloud EventBridge. Real-time events to multiple services.',
    icon: 'Activity',
    providers: ['alibaba'],
    nodeDataDefaults: {
      iceType: 'Messaging.Topic',
    },
  }
);
