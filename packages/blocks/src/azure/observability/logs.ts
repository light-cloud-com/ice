import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureLogsBlueprint: BlockBlueprint = createBlueprintFromResource('log-group', {
  iceType: 'Monitoring.Log',
  category: 'observability',
  name: 'Logs',
  description: 'Azure Monitor. Live tail logs on the canvas; errors, performance, alerts.',
  icon: 'FileText',
  providers: ['azure'],
  nodeDataDefaults: { streamingMode: 'polling' },
});
