import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const digitaloceanRedisCacheBlueprint: BlockBlueprint = createBlueprintFromResource('redis-cache', {
  blockType: 'digitalocean-redis-cache',
  category: 'data',
  name: 'DigitalOcean Cache',
  description: 'DigitalOcean Managed Redis. Redis for fast reads.',
  icon: 'Zap',
  providers: ['digitalocean'],
  nodeDataDefaults: {
    iceType: 'Database.Redis',
    runtime: 'Redis 7',
    port: 6379,
  },
});
