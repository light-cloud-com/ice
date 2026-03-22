import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsVectorDbBlueprint: BlockBlueprint = createBlueprintFromResource('vector-db', {
  blockType: 'aws-vector-db',
  category: 'ai',
  name: 'AWS Vector DB',
  description: 'AWS OpenSearch Serverless. Embeddings + similarity search.',
  icon: 'Waypoints',
  providers: ['aws'],
  nodeDataDefaults: {
    iceType: 'AI.VectorDB',
    runtime: 'Amazon OpenSearch Serverless',
    port: 443,
  },
});
