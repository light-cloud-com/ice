import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpEventStreamBlueprint: BlockBlueprint = createBlueprintFromResource('event-stream', {
  blockType: 'gcp-event-stream',
  category: 'messaging',
  name: 'GCP Event Stream',
  description: 'Google Cloud Dataflow. Real-time events to multiple services.',
  icon: 'Activity',
  providers: ['gcp'],
  nodeDataDefaults: {
    iceType: 'Messaging.Topic',
  },
});
