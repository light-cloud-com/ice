import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsLogsBlueprint: BlockBlueprint = createBlueprintFromResource('log-group', {
  iceType: 'Monitoring.Log',
  category: 'observability',
  name: 'AWS Logs',
  description: 'AWS CloudWatch. Errors, performance, alerts.',
  icon: 'FileText',
  providers: ['aws'],
  nodeDataDefaults: {
  },
});
