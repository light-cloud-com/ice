/**
 * Tablestore Blueprint — Flat Card
 *
 * Database.Tablestore — Alibaba Cloud NoSQL wide-column store.
 */

import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const tablestoreBlueprint: BlockBlueprint = createBlueprintFromResource('tablestore', {
  iceType: 'Database.Tablestore',
  category: 'data',
  name: 'Tablestore',
  description: 'Alibaba Cloud NoSQL wide-column. Serverless.',
  icon: 'Database',
  providers: ['alibaba'],
  nodeDataDefaults: {
    runtime: 'Tablestore',
  },
});
