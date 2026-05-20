import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const ociRedisCacheBlueprint: BlockBlueprint = createBlueprintFromResource('redis-cache', {
  iceType: 'Database.Redis',
  category: 'data',
  name: 'OCI Cache',
  description: 'Oracle Cloud Cache with Redis. Redis for fast reads.',
  icon: 'Zap',
  providers: ['oci'],
  nodeDataDefaults: {
    runtime: 'Redis 7',
    port: 6379,
  },
});
