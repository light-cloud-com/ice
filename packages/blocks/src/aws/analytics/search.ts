import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsSearchBlueprint: BlockBlueprint = createBlueprintFromResource('search-engine', {
  iceType: 'Analytics.Search',
  category: 'analytics',
  name: 'AWS Search',
  description: 'AWS OpenSearch. Full-text search.',
  icon: 'Search',
  providers: ['aws'],
  nodeDataDefaults: {
    runtime: 'Amazon OpenSearch',
    port: 9200,
  },
});
