import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpLogTerminalBlueprint: BlockBlueprint = createBlueprintFromResource('log-group', {
  blockType: 'gcp-log-terminal',
  category: 'observability',
  name: 'GCP Log Terminal',
  description: 'Google Cloud Logging. Live streaming log viewer.',
  icon: 'Terminal',
  providers: ['gcp'],
  nodeDataDefaults: {
    iceType: 'Log.Terminal',
    serviceName: 'default',
  },
});
