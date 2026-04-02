import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureSearchBlueprint: BlockBlueprint = createBlueprintFromResource('search-engine', {
  iceType: 'Analytics.Search',
  category: 'analytics',
  name: 'Azure Search',
  description: 'Azure Cognitive Search. Full-text search.',
  icon: 'Search',
  providers: ['azure'],
  nodeDataDefaults: {
    runtime: 'Azure Cognitive Search',
    port: 9200,
  },
});
