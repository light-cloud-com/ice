import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const digitaloceanRedisCacheBlueprint: BlockBlueprint = createBlueprintFromResource('redis-cache', {
  iceType: 'Database.Redis',
  category: 'data',
  name: 'DigitalOcean Cache',
  description: 'DigitalOcean Managed Redis. Redis for fast reads.',
  icon: 'Zap',
  providers: ['digitalocean'],
  nodeDataDefaults: {
    runtime: 'Redis 7',
    port: 6379,
  },
});
