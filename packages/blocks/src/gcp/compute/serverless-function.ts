import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpServerlessFunctionBlueprint: BlockBlueprint = createBlueprintFromResource('serverless-function', {
  iceType: 'Compute.ServerlessFunction',
  category: 'compute',
  name: 'GCP Cloud Function',
  description: 'Google Cloud Functions. Event-driven, scales to zero.',
  icon: 'Zap',
  providers: ['gcp'],
  nodeDataDefaults: {
    runtime: 'Node.js 20',
    memory: '128-200mhz',
    timeout: 30,
  },
});
