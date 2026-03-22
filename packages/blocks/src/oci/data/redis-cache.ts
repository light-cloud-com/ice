import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const ociRedisCacheBlueprint: BlockBlueprint = createBlueprintFromResource('redis-cache', {
  blockType: 'oci-redis-cache',
  category: 'data',
  name: 'OCI Cache',
  description: 'Oracle Cloud Cache with Redis. Redis for fast reads.',
  icon: 'Zap',
  providers: ['oci'],
  nodeDataDefaults: {
    iceType: 'Database.Redis',
    runtime: 'Redis 7',
    port: 6379,
  },
});
