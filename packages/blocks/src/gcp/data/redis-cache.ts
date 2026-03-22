import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpRedisCacheBlueprint: BlockBlueprint = createBlueprintFromResource('redis-cache', {
  blockType: 'gcp-redis-cache',
  category: 'data',
  name: 'GCP Cache',
  description: 'Google Cloud Memorystore. Redis for fast reads.',
  icon: 'Zap',
  providers: ['gcp'],
  nodeDataDefaults: {
    iceType: 'Database.Redis',
    runtime: 'Redis 7',
    port: 6379,
  },
});
