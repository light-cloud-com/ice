import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const eventStreamConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('event-stream', {
    iceType: 'Messaging.EventStream',
    category: 'messaging',
    name: 'Event Stream',
    description: 'Pub/sub fan-out stream. One event, many consumers. Kinesis / Pub/Sub / Event Hubs.',
    icon: 'Radio',
    providers: ['aws', 'gcp', 'azure'],
    nodeDataDefaults: { label: 'Event Stream', retentionHours: 24, partitionCount: 1 },
  }),
  conceptId: 'event-stream',
  visualFamily: 'messaging',
};
