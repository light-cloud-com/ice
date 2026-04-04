import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpRedisCacheBlueprint: BlockBlueprint = createBlueprintFromResource('redis-cache', {
  iceType: 'Database.Redis',
  category: 'data',
  name: 'GCP Cache',
  description: 'Google Cloud Memorystore. Redis for fast reads.',
  icon: 'Zap',
  providers: ['gcp'],
  nodeDataDefaults: {
    runtime: 'Redis 7',
    port: 6379,
    size: 'M1',
  },
});
