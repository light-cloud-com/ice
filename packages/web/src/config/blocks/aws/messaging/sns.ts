/**
 * SNS Blueprint — Flat Card
 *
 * Messaging.SNS — pub/sub notifications.
 */

import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const snsBlueprint: BlockBlueprint = createBlueprintFromResource('event-bus', {
  blockType: 'sns',
  category: 'messaging',
  name: 'SNS',
  description: 'AWS pub/sub notifications.',
  icon: 'Bell',
  providers: ['aws'],
  nodeDataDefaults: {
    iceType: 'Messaging.SNS',
    runtime: 'SNS',
  },
});
