import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const redisCacheConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('redis-cache', {
    iceType: 'Database.Redis',
    category: 'data',
    name: 'Redis Cache',
    description: 'Managed in-memory cache. Sub-millisecond reads. Sessions, rate limits, pub/sub, job queues.',
    icon: 'Zap',
    providers: ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean', 'ibm'],
    nodeDataDefaults: { label: 'Redis', version: '7', tier: 'small', memoryMb: 256 },
  }),
  conceptId: 'redis-cache',
  visualFamily: 'data',
};
