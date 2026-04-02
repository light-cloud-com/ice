import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpVectorDbBlueprint: BlockBlueprint = createBlueprintFromResource('vector-db', {
  iceType: 'AI.VectorDB',
  category: 'ai',
  name: 'GCP Vector DB',
  description: 'Google Vertex AI Vector Search. Embeddings + similarity search.',
  icon: 'Waypoints',
  providers: ['gcp'],
  nodeDataDefaults: {
    runtime: 'Vertex AI Vector Search',
    port: 443,
  },
});
