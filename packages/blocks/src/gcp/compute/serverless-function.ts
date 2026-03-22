import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpServerlessFunctionBlueprint: BlockBlueprint = createBlueprintFromResource('serverless-function', {
  blockType: 'gcp-serverless-function',
  category: 'compute',
  name: 'GCP Cloud Function',
  description: 'Google Cloud Functions. Event-driven, scales to zero.',
  icon: 'Zap',
  providers: ['gcp'],
  nodeDataDefaults: {
    iceType: 'Application.ServerlessFunction',
    runtime: 'Node.js 20',
    memory: 256,
    timeout: 30,
  },
});
