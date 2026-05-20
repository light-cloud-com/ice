/**
 * Cloud Pub/Sub Blueprint — Flat Card
 *
 * Messaging.CloudPubSub — managed pub/sub, global.
 */

import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const cloudPubsubBlueprint: BlockBlueprint = createBlueprintFromResource('cloud-pubsub', {
  iceType: 'Messaging.CloudPubSub',
  category: 'messaging',
  name: 'Cloud Pub/Sub',
  description: 'Google Cloud managed pub/sub. Global.',
  icon: 'Bell',
  providers: ['gcp'],
  nodeDataDefaults: {
    runtime: 'Cloud Pub/Sub',
  },
});
