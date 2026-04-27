import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpLogsBlueprint: BlockBlueprint = createBlueprintFromResource('log-group', {
  iceType: 'Monitoring.Log',
  category: 'observability',
  name: 'Logs',
  description: 'Google Cloud Logging. Live tail logs on the canvas; errors, performance, alerts.',
  icon: 'FileText',
  providers: ['gcp'],
  nodeDataDefaults: { streamingMode: 'polling' },
});
