/**
 * SNS Blueprint — Flat Card
 *
 * Messaging.SNS — pub/sub notifications.
 */

import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const snsBlueprint: BlockBlueprint = createBlueprintFromResource('event-bus', {
  iceType: 'Messaging.SNS',
  category: 'messaging',
  name: 'SNS',
  description: 'AWS pub/sub notifications.',
  icon: 'Bell',
  providers: ['aws'],
  nodeDataDefaults: {
    runtime: 'SNS',
  },
});
