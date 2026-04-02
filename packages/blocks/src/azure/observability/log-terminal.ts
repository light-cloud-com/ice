import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureLogTerminalBlueprint: BlockBlueprint = createBlueprintFromResource('log-group', {
  iceType: 'Monitoring.Terminal',
  category: 'observability',
  name: 'Azure Log Terminal',
  description: 'Azure Monitor. Live streaming log viewer.',
  icon: 'Terminal',
  providers: ['azure'],
  nodeDataDefaults: {
    serviceName: 'default',
  },
});
