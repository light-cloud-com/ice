import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const vectorDbConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('vector-db', {
    iceType: 'AI.VectorDB',
    category: 'ai',
    name: 'Vector DB',
    description: 'Vector database for embeddings. Semantic search, RAG, recommendation systems.',
    icon: 'Target',
    providers: ['aws', 'gcp', 'azure'],
    nodeDataDefaults: { label: 'Vector DB', dimensions: 1536, metric: 'cosine' },
  }),
  conceptId: 'vector-db',
  visualFamily: 'ai',
};
