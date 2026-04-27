import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesLogsBlueprint: BlockBlueprint = createBlueprintFromResource('log-group', {
  iceType: 'Monitoring.Log',
  category: 'observability',
  name: 'Logs',
  description: 'Kubernetes Fluentd/Loki. Live tail logs on the canvas; errors, performance, alerts.',
  icon: 'FileText',
  providers: ['kubernetes'],
  nodeDataDefaults: { streamingMode: 'polling' },
});
