import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const digitaloceanMongodbBlueprint: BlockBlueprint = createBlueprintFromResource('mongodb', {
  blockType: 'digitalocean-mongodb',
  category: 'data',
  name: 'DigitalOcean MongoDB',
  description: 'DigitalOcean Managed MongoDB. Document store, schema-flexible.',
  icon: 'Database',
  providers: ['digitalocean'],
  nodeDataDefaults: {
    iceType: 'Database.MongoDB',
    runtime: 'MongoDB 7',
    port: 27017,
    size: 'M10',
    storage: '10 GB',
    domain: 'mongo.internal',
  },
});
