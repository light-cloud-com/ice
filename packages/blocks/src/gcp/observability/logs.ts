import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpLogsBlueprint: BlockBlueprint = createBlueprintFromResource('log-group', {
  iceType: 'Monitoring.Log',
  category: 'observability',
  name: 'GCP Logs',
  description: 'Google Cloud Logging. Errors, performance, alerts.',
  icon: 'FileText',
  providers: ['gcp'],
  nodeDataDefaults: {
  },
});
