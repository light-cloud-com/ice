import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsMongodbBlueprint: BlockBlueprint = createBlueprintFromResource('mongodb', {
  iceType: 'Database.MongoDB',
  category: 'data',
  name: 'AWS MongoDB',
  description: 'AWS DocumentDB. Document store, schema-flexible.',
  icon: 'Database',
  providers: ['aws'],
  nodeDataDefaults: {
    runtime: 'MongoDB 7',
    port: 27017,
    size: 'M10',
    storage: '10 GB',
    domain: 'mongo.internal',
  },
});
