import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpMlModelBlueprint: BlockBlueprint = createBlueprintFromResource('ml-model', {
  iceType: 'AI.ModelServing',
  category: 'ai',
  name: 'GCP ML Model',
  description: 'Google Vertex AI Endpoint. Deploy + serve ML models.',
  icon: 'Brain',
  providers: ['gcp'],
  nodeDataDefaults: {
    runtime: 'Vertex AI Endpoint',
    port: 8080,
  },
});
