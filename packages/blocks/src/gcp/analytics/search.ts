import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpSearchBlueprint: BlockBlueprint = createBlueprintFromResource('search-engine', {
  iceType: 'Analytics.Search',
  category: 'analytics',
  name: 'GCP Search',
  description: 'Google Vertex AI Search (Discovery Engine). Full-text + semantic search.',
  icon: 'Search',
  providers: ['gcp'],
  nodeDataDefaults: {
    runtime: 'Vertex AI Search',
    port: 443,
  },
});
