/**
 * Cosmos DB Blueprint — Flat Card
 *
 * Database.CosmosDB — multi-model with global distribution.
 */

import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const cosmosdbBlueprint: BlockBlueprint = createBlueprintFromResource('cosmosdb', {
  blockType: 'cosmosdb',
  category: 'data',
  name: 'Cosmos DB',
  description: 'Azure multi-model DB. Global distribution.',
  icon: 'Database',
  providers: ['azure'],
  nodeDataDefaults: {
    iceType: 'Database.CosmosDB',
    runtime: 'Cosmos DB NoSQL',
  },
});
