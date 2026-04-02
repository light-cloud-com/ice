/**
 * OCI Functions Blueprint — Flat Card
 *
 * Application.OCIFunctions — Oracle Cloud serverless, Fn-based.
 */

import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const ociFunctionsBlueprint: BlockBlueprint = createBlueprintFromResource('oci-functions', {
  iceType: 'Compute.OCIFunctions',
  category: 'compute',
  name: 'OCI Functions',
  description: 'Oracle Cloud serverless. Fn-based.',
  icon: 'Zap',
  providers: ['oci'],
  nodeDataDefaults: {
    runtime: 'Node.js 18',
    memory: 256,
    timeout: 30,
  },
});
