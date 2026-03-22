import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsRedisCacheBlueprint: BlockBlueprint = createBlueprintFromResource('redis-cache', {
  blockType: 'aws-redis-cache',
  category: 'data',
  name: 'AWS Cache',
  description: 'AWS ElastiCache. Redis for fast reads.',
  icon: 'Zap',
  providers: ['aws'],
  nodeDataDefaults: {
    iceType: 'Database.Redis',
    runtime: 'Redis 7',
    port: 6379,
  },
});
