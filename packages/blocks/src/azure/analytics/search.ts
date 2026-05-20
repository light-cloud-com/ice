import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureSearchBlueprint: BlockBlueprint = createBlueprintFromResource('search-engine', {
  iceType: 'Analytics.Search',
  category: 'analytics',
  name: 'Azure Search',
  description: 'Azure AI Search. Full-text search.',
  icon: 'Search',
  providers: ['azure'],
  nodeDataDefaults: {
    runtime: 'Azure AI Search',
    port: 443,
  },
});
