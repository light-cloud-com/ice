import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureMongodbBlueprint: BlockBlueprint = createBlueprintFromResource('mongodb', {
  iceType: 'Database.MongoDB',
  category: 'data',
  name: 'Azure MongoDB',
  description: 'Azure Cosmos DB (MongoDB API). Document store, schema-flexible.',
  icon: 'Database',
  providers: ['azure'],
  nodeDataDefaults: {
    runtime: 'MongoDB 7',
    port: 27017,
    size: 'M10',
    storage: '10 GB',
    domain: 'mongo.internal',
  },
});
