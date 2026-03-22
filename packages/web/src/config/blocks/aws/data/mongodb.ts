import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsMongodbBlueprint: BlockBlueprint = createBlueprintFromResource('mongodb', {
  blockType: 'aws-mongodb',
  category: 'data',
  name: 'AWS MongoDB',
  description: 'AWS DocumentDB. Document store, schema-flexible.',
  icon: 'Database',
  providers: ['aws'],
  nodeDataDefaults: {
    iceType: 'Database.MongoDB',
    runtime: 'MongoDB 7',
    port: 27017,
    size: 'M10',
    storage: '10 GB',
    domain: 'mongo.internal',
  },
});
