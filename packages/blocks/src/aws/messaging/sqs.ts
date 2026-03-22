/**
 * SQS Blueprint — Flat Card
 *
 * Messaging.SQS — managed queue with guaranteed delivery.
 */

import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const sqsBlueprint: BlockBlueprint = createBlueprintFromResource('message-queue', {
  blockType: 'sqs',
  category: 'messaging',
  name: 'SQS',
  description: 'AWS managed queue. Guaranteed delivery.',
  icon: 'List',
  providers: ['aws'],
  nodeDataDefaults: {
    iceType: 'Messaging.SQS',
    runtime: 'SQS FIFO',
  },
});
