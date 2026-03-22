import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureRedisCacheBlueprint: BlockBlueprint = createBlueprintFromResource('redis-cache', {
  blockType: 'azure-redis-cache',
  category: 'data',
  name: 'Azure Cache',
  description: 'Azure Cache for Redis. Redis for fast reads.',
  icon: 'Zap',
  providers: ['azure'],
  nodeDataDefaults: {
    iceType: 'Database.Redis',
    runtime: 'Redis 7',
    port: 6379,
  },
});
