import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsServerlessFunctionBlueprint: BlockBlueprint = createBlueprintFromResource(
  'serverless-function',
  {
    blockType: 'aws-serverless-function',
    category: 'compute',
    name: 'AWS Lambda',
    description: 'AWS Lambda. Event-driven, scales to zero.',
    icon: 'Zap',
    providers: ['aws'],
    nodeDataDefaults: {
      iceType: 'Application.ServerlessFunction',
      runtime: 'Node.js 20',
      memory: 256,
      timeout: 30,
    },
  }
);
