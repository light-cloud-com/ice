import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const messageQueueConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('message-queue', {
    iceType: 'Messaging.Queue',
    category: 'messaging',
    name: 'Message Queue',
    description: 'Point-to-point async queue. Producer drops a job, a Worker picks it up. SQS / Pub/Sub / Service Bus.',
    icon: 'ListOrdered',
    providers: ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'ibm'],
    nodeDataDefaults: { label: 'Queue', visibilityTimeout: 30, maxRetries: 3 },
  }),
  conceptId: 'message-queue',
  visualFamily: 'messaging',
};
