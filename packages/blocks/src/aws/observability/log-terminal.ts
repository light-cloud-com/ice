import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsLogTerminalBlueprint: BlockBlueprint = createBlueprintFromResource('log-group', {
  blockType: 'aws-log-terminal',
  category: 'observability',
  name: 'AWS Log Terminal',
  description: 'AWS CloudWatch. Live streaming log viewer.',
  icon: 'Terminal',
  providers: ['aws'],
  nodeDataDefaults: {
    iceType: 'Log.Terminal',
    serviceName: 'default',
  },
});
