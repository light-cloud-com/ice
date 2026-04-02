import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpMongodbBlueprint: BlockBlueprint = createBlueprintFromResource('mongodb', {
  iceType: 'Database.MongoDB',
  category: 'data',
  name: 'GCP MongoDB',
  description: 'Google Cloud MongoDB Atlas. Document store, schema-flexible.',
  icon: 'Database',
  providers: ['gcp'],
  nodeDataDefaults: {
    runtime: 'MongoDB 7',
    port: 27017,
    size: 'M10',
    storage: '10 GB',
    domain: 'mongo.internal',
  },
});
