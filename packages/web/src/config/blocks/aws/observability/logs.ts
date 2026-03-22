import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsLogsBlueprint: BlockBlueprint = createBlueprintFromResource('log-group', {
  blockType: 'aws-logs',
  category: 'observability',
  name: 'AWS Logs',
  description: 'AWS CloudWatch. Errors, performance, alerts.',
  icon: 'FileText',
  providers: ['aws'],
  nodeDataDefaults: {
    iceType: 'Monitoring.Log',
  },
});
