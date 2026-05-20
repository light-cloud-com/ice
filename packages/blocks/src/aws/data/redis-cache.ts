import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsRedisCacheBlueprint: BlockBlueprint = createBlueprintFromResource('redis-cache', {
  iceType: 'Database.Redis',
  category: 'data',
  name: 'AWS Cache',
  description: 'AWS ElastiCache. Redis for fast reads.',
  icon: 'Zap',
  providers: ['aws'],
  nodeDataDefaults: {
    runtime: 'Redis 7',
    port: 6379,
  },
});
