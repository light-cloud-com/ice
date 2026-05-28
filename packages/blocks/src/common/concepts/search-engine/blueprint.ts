import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const searchEngineConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('search-engine', {
    iceType: 'Analytics.Search',
    category: 'data',
    name: 'Search',
    description: 'Full-text search and analytics — OpenSearch, Vertex AI Search, Cognitive Search.',
    icon: 'Search',
    providers: ['aws', 'gcp', 'azure', 'alibaba', 'oci'],
    nodeDataDefaults: { label: 'Search' },
  }),
  conceptId: 'search-engine',
  visualFamily: 'data',
};
