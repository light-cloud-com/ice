import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureLogTerminalBlueprint: BlockBlueprint = createBlueprintFromResource('log-group', {
  blockType: 'azure-log-terminal',
  category: 'observability',
  name: 'Azure Log Terminal',
  description: 'Azure Monitor. Live streaming log viewer.',
  icon: 'Terminal',
  providers: ['azure'],
  nodeDataDefaults: {
    iceType: 'Log.Terminal',
    serviceName: 'default',
  },
});
