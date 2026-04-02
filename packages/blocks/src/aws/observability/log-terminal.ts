import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsLogTerminalBlueprint: BlockBlueprint = createBlueprintFromResource('log-group', {
  iceType: 'Monitoring.Terminal',
  category: 'observability',
  name: 'AWS Log Terminal',
  description: 'AWS CloudWatch. Live streaming log viewer.',
  icon: 'Terminal',
  providers: ['aws'],
  nodeDataDefaults: {
    serviceName: 'default',
  },
});
