import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsEventStreamBlueprint: BlockBlueprint = createBlueprintFromResource('event-stream', {
  blockType: 'aws-event-stream',
  category: 'messaging',
  name: 'AWS Event Stream',
  description: 'AWS Kinesis. Real-time events to multiple services.',
  icon: 'Activity',
  providers: ['aws'],
  nodeDataDefaults: {
    iceType: 'Messaging.Topic',
  },
});
