import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsMlModelBlueprint: BlockBlueprint = createBlueprintFromResource('ml-model', {
  iceType: 'AI.ModelServing',
  category: 'ai',
  name: 'AWS ML Model',
  description: 'AWS SageMaker. Deploy + serve ML models.',
  icon: 'Brain',
  providers: ['aws'],
  nodeDataDefaults: {
    runtime: 'SageMaker Endpoint',
    port: 8080,
  },
});
