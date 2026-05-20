import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesRedisCacheBlueprint: BlockBlueprint = createBlueprintFromResource('redis-cache', {
  iceType: 'Database.Redis',
  category: 'data',
  name: 'Kubernetes Cache',
  description: 'Kubernetes Redis StatefulSet. Redis for fast reads.',
  icon: 'Zap',
  providers: ['kubernetes'],
  nodeDataDefaults: {
    runtime: 'Redis 7',
    port: 6379,
  },
});
