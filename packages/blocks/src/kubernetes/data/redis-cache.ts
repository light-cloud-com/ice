import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesRedisCacheBlueprint: BlockBlueprint = createBlueprintFromResource(
  'redis-cache',
  {
    blockType: 'kubernetes-redis-cache',
    category: 'data',
    name: 'Kubernetes Cache',
    description: 'Kubernetes Redis StatefulSet. Redis for fast reads.',
    icon: 'Zap',
    providers: ['kubernetes'],
    nodeDataDefaults: {
      iceType: 'Database.Redis',
      runtime: 'Redis 7',
      port: 6379,
    },
  }
);
