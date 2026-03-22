import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpVectorDbBlueprint: BlockBlueprint = createBlueprintFromResource('vector-db', {
  blockType: 'gcp-vector-db',
  category: 'ai',
  name: 'GCP Vector DB',
  description: 'Google Vertex AI Vector Search. Embeddings + similarity search.',
  icon: 'Waypoints',
  providers: ['gcp'],
  nodeDataDefaults: {
    iceType: 'AI.VectorDB',
    runtime: 'Vertex AI Vector Search',
    port: 443,
  },
});
