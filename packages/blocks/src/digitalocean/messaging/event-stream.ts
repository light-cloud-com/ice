import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const digitaloceanEventStreamBlueprint: BlockBlueprint = createBlueprintFromResource('event-stream', {
  blockType: 'digitalocean-event-stream',
  category: 'messaging',
  name: 'DigitalOcean Event Stream',
  description: 'DigitalOcean managed Kafka. Real-time events to multiple services.',
  icon: 'Activity',
  providers: ['digitalocean'],
  nodeDataDefaults: {
    iceType: 'Messaging.Topic',
  },
});
