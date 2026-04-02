import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpSearchBlueprint: BlockBlueprint = createBlueprintFromResource('search-engine', {
  iceType: 'Analytics.Search',
  category: 'analytics',
  name: 'GCP Search',
  description: 'Google Elasticsearch Service. Full-text search.',
  icon: 'Search',
  providers: ['gcp'],
  nodeDataDefaults: {
    runtime: 'Elasticsearch',
    port: 9200,
  },
});
