import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureServerlessFunctionBlueprint: BlockBlueprint = createBlueprintFromResource('serverless-function', {
  iceType: 'Compute.ServerlessFunction',
  category: 'compute',
  name: 'Azure Function',
  description: 'Azure Functions. Event-driven, scales to zero.',
  icon: 'Zap',
  providers: ['azure'],
  nodeDataDefaults: {
    runtime: 'Node.js 20',
    memory: 256,
    timeout: 30,
  },
});
