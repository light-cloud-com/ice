import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpMongodbBlueprint: BlockBlueprint = createBlueprintFromResource('mongodb', {
  blockType: 'gcp-mongodb',
  category: 'data',
  name: 'GCP MongoDB',
  description: 'Google Cloud MongoDB Atlas. Document store, schema-flexible.',
  icon: 'Database',
  providers: ['gcp'],
  nodeDataDefaults: {
    iceType: 'Database.MongoDB',
    runtime: 'MongoDB 7',
    port: 27017,
    size: 'M10',
    storage: '10 GB',
    domain: 'mongo.internal',
  },
});
