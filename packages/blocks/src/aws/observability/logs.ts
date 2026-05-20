import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsLogsBlueprint: BlockBlueprint = createBlueprintFromResource('log-group', {
  iceType: 'Monitoring.Log',
  category: 'observability',
  name: 'Logs',
  description: 'AWS CloudWatch. Live tail logs on the canvas; errors, performance, alerts.',
  icon: 'FileText',
  providers: ['aws'],
  nodeDataDefaults: { streamingMode: 'polling' },
});
