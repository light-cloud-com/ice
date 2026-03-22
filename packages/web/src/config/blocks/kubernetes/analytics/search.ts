import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesSearchBlueprint: BlockBlueprint = createBlueprintFromResource(
  'search-engine',
  {
    blockType: 'kubernetes-search',
    category: 'analytics',
    name: 'Kubernetes Search',
    description: 'Kubernetes OpenSearch. Full-text search.',
    icon: 'Search',
    providers: ['kubernetes'],
    nodeDataDefaults: {
      iceType: 'Analytics.Search',
      runtime: 'OpenSearch 2.11',
      port: 9200,
    },
  }
);
