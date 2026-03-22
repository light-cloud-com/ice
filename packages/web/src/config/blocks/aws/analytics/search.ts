import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsSearchBlueprint: BlockBlueprint = createBlueprintFromResource('search-engine', {
  blockType: 'aws-search',
  category: 'analytics',
  name: 'AWS Search',
  description: 'AWS OpenSearch. Full-text search.',
  icon: 'Search',
  providers: ['aws'],
  nodeDataDefaults: {
    iceType: 'Analytics.Search',
    runtime: 'Amazon OpenSearch',
    port: 9200,
  },
});
