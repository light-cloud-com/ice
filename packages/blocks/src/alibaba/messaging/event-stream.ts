import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const alibabaEventStreamBlueprint: BlockBlueprint = createBlueprintFromResource('event-stream', {
  iceType: 'Messaging.Topic',
  category: 'messaging',
  name: 'Alibaba Event Stream',
  description: 'Alibaba Cloud EventBridge. Real-time events to multiple services.',
  icon: 'Activity',
  providers: ['alibaba'],
  nodeDataDefaults: {},
});
