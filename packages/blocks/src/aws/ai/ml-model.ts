import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsMlModelBlueprint: BlockBlueprint = createBlueprintFromResource('ml-model', {
  blockType: 'aws-ml-model',
  category: 'ai',
  name: 'AWS ML Model',
  description: 'AWS SageMaker. Deploy + serve ML models.',
  icon: 'Brain',
  providers: ['aws'],
  nodeDataDefaults: {
    iceType: 'AI.ModelServing',
    runtime: 'SageMaker Endpoint',
    port: 8080,
  },
});
