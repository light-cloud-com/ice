import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpMlModelBlueprint: BlockBlueprint = createBlueprintFromResource('ml-model', {
  blockType: 'gcp-ml-model',
  category: 'ai',
  name: 'GCP ML Model',
  description: 'Google Vertex AI Endpoint. Deploy + serve ML models.',
  icon: 'Brain',
  providers: ['gcp'],
  nodeDataDefaults: {
    iceType: 'AI.ModelServing',
    runtime: 'Vertex AI Endpoint',
    port: 8080,
  },
});
