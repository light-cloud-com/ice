/**
 * Tablestore Blueprint — Flat Card
 *
 * Database.Tablestore — Alibaba Cloud NoSQL wide-column store.
 */

import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const tablestoreBlueprint: BlockBlueprint = createBlueprintFromResource('tablestore', {
  blockType: 'tablestore',
  category: 'data',
  name: 'Tablestore',
  description: 'Alibaba Cloud NoSQL wide-column. Serverless.',
  icon: 'Database',
  providers: ['alibaba'],
  nodeDataDefaults: {
    iceType: 'Database.Tablestore',
    runtime: 'Tablestore',
  },
});
