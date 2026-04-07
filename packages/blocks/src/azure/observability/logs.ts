import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureLogsBlueprint: BlockBlueprint = createBlueprintFromResource('log-group', {
  iceType: 'Monitoring.Log',
  category: 'observability',
  name: 'Azure Logs',
  description: 'Azure Monitor. Errors, performance, alerts.',
  icon: 'FileText',
  providers: ['azure'],
  nodeDataDefaults: {},
});
