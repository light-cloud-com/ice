import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpLogTerminalBlueprint: BlockBlueprint = createBlueprintFromResource('log-group', {
  iceType: 'Monitoring.Terminal',
  category: 'observability',
  name: 'GCP Log Terminal',
  description: 'Google Cloud Logging. Live streaming log viewer.',
  icon: 'Terminal',
  providers: ['gcp'],
  nodeDataDefaults: {
    serviceName: 'default',
  },
});
