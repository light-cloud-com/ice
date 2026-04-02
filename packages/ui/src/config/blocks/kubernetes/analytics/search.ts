import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesSearchBlueprint: BlockBlueprint = createBlueprintFromResource('search-engine', {
  iceType: 'Analytics.Search',
  category: 'analytics',
  name: 'Kubernetes Search',
  description: 'Kubernetes OpenSearch. Full-text search.',
  icon: 'Search',
  providers: ['kubernetes'],
  nodeDataDefaults: {
    runtime: 'OpenSearch 2.11',
    port: 9200,
  },
});
