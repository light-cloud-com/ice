import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureMlModelBlueprint: BlockBlueprint = createBlueprintFromResource('ml-model', {
  iceType: 'AI.ModelServing',
  category: 'ai',
  name: 'Azure ML Model',
  description: 'Azure ML Endpoint. Deploy + serve ML models.',
  icon: 'Brain',
  providers: ['azure'],
  nodeDataDefaults: {
    runtime: 'Azure ML Endpoint',
    port: 8080,
  },
});
