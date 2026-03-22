import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesEventStreamBlueprint: BlockBlueprint = createBlueprintFromResource('event-stream', {
  blockType: 'kubernetes-event-stream',
  category: 'messaging',
  name: 'Kubernetes Event Stream',
  description: 'Kubernetes Kafka/NATS. Real-time events to multiple services.',
  icon: 'Activity',
  providers: ['kubernetes'],
  nodeDataDefaults: {
    iceType: 'Messaging.Topic',
  },
});
