import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpSearchBlueprint: BlockBlueprint = createBlueprintFromResource('search-engine', {
  blockType: 'gcp-search',
  category: 'analytics',
  name: 'GCP Search',
  description: 'Google Elasticsearch Service. Full-text search.',
  icon: 'Search',
  providers: ['gcp'],
  nodeDataDefaults: {
    iceType: 'Analytics.Search',
    runtime: 'Elasticsearch',
    port: 9200,
  },
});
