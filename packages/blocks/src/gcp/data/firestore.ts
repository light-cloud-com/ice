/**
 * Firestore Blueprint — Flat Card
 *
 * Database.Firestore — document DB with real-time sync.
 */

import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const firestoreBlueprint: BlockBlueprint = createBlueprintFromResource('firestore', {
  iceType: 'Database.Firestore',
  category: 'data',
  name: 'Firestore',
  description: 'Google Cloud document DB. Real-time sync.',
  icon: 'Database',
  providers: ['gcp'],
  nodeDataDefaults: {
    runtime: 'Firestore Native',
  },
});
