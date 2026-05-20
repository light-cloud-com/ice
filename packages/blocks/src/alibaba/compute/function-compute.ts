/**
 * Function Compute Blueprint — Flat Card
 *
 * Application.FunctionCompute — Alibaba Cloud serverless functions.
 */

import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const functionComputeBlueprint: BlockBlueprint = createBlueprintFromResource('function-compute', {
  iceType: 'Compute.FunctionCompute',
  category: 'compute',
  name: 'Function Compute',
  description: 'Alibaba Cloud serverless functions. Event-driven.',
  icon: 'Zap',
  providers: ['alibaba'],
  nodeDataDefaults: {
    runtime: 'Node.js 20',
    memory: 256,
    timeout: 60,
  },
});
