import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsServerlessFunctionBlueprint: BlockBlueprint = createBlueprintFromResource('serverless-function', {
  iceType: 'Compute.ServerlessFunction',
  category: 'compute',
  name: 'AWS Lambda',
  description: 'AWS Lambda. Event-driven, scales to zero.',
  icon: 'Zap',
  providers: ['aws'],
  nodeDataDefaults: {
    runtime: 'Node.js 20',
    memory: 256,
    timeout: 30,
  },
});
