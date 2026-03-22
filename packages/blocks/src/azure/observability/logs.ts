import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureLogsBlueprint: BlockBlueprint = createBlueprintFromResource('log-group', {
  blockType: 'azure-logs',
  category: 'observability',
  name: 'Azure Logs',
  description: 'Azure Monitor. Errors, performance, alerts.',
  icon: 'FileText',
  providers: ['azure'],
  nodeDataDefaults: {
    iceType: 'Monitoring.Log',
  },
});
