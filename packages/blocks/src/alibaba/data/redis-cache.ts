import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const alibabaRedisCacheBlueprint: BlockBlueprint = createBlueprintFromResource('redis-cache', {
  blockType: 'alibaba-redis-cache',
  category: 'data',
  name: 'Alibaba Cache',
  description: 'Alibaba Cloud ApsaraDB for Redis. Redis for fast reads.',
  icon: 'Zap',
  providers: ['alibaba'],
  nodeDataDefaults: {
    iceType: 'Database.Redis',
    runtime: 'Redis 7',
    port: 6379,
  },
});
