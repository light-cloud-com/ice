import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpLogsBlueprint: BlockBlueprint = createBlueprintFromResource('log-group', {
  blockType: 'gcp-logs',
  category: 'observability',
  name: 'GCP Logs',
  description: 'Google Cloud Logging. Errors, performance, alerts.',
  icon: 'FileText',
  providers: ['gcp'],
  nodeDataDefaults: {
    iceType: 'Monitoring.Log',
  },
});
