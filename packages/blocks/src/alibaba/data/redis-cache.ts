import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const alibabaRedisCacheBlueprint: BlockBlueprint = createBlueprintFromResource('redis-cache', {
  iceType: 'Database.Redis',
  category: 'data',
  name: 'Alibaba Cache',
  description: 'Alibaba Cloud ApsaraDB for Redis. Redis for fast reads.',
  icon: 'Zap',
  providers: ['alibaba'],
  nodeDataDefaults: {
    runtime: 'Redis 7',
    port: 6379,
  },
});
