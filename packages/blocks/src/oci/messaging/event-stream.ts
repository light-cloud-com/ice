import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const ociEventStreamBlueprint: BlockBlueprint = createBlueprintFromResource('event-stream', {
  blockType: 'oci-event-stream',
  category: 'messaging',
  name: 'OCI Event Stream',
  description: 'Oracle Cloud Streaming. Real-time events to multiple services.',
  icon: 'Activity',
  providers: ['oci'],
  nodeDataDefaults: {
    iceType: 'Messaging.Topic',
  },
});
