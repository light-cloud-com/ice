import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesEventStreamBlueprint: BlockBlueprint = createBlueprintFromResource('event-stream', {
  iceType: 'Messaging.Topic',
  category: 'messaging',
  name: 'Kubernetes Event Stream',
  description: 'Kubernetes Kafka/NATS. Real-time events to multiple services.',
  icon: 'Activity',
  providers: ['kubernetes'],
  nodeDataDefaults: {
  },
});
