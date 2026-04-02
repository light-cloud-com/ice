import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureVectorDbBlueprint: BlockBlueprint = createBlueprintFromResource('vector-db', {
  iceType: 'AI.VectorDB',
  category: 'ai',
  name: 'Azure Vector DB',
  description: 'Azure AI Search. Embeddings + similarity search.',
  icon: 'Waypoints',
  providers: ['azure'],
  nodeDataDefaults: {
    runtime: 'Azure AI Search',
    port: 443,
  },
});
