import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureSearchBlueprint: BlockBlueprint = createBlueprintFromResource('search-engine', {
  blockType: 'azure-search',
  category: 'analytics',
  name: 'Azure Search',
  description: 'Azure Cognitive Search. Full-text search.',
  icon: 'Search',
  providers: ['azure'],
  nodeDataDefaults: {
    iceType: 'Analytics.Search',
    runtime: 'Azure Cognitive Search',
    port: 9200,
  },
});
