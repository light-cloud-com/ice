import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesLogsBlueprint: BlockBlueprint = createBlueprintFromResource('log-group', {
  blockType: 'kubernetes-logs',
  category: 'observability',
  name: 'Kubernetes Logs',
  description: 'Kubernetes Fluentd/Loki. Errors, performance, alerts.',
  icon: 'FileText',
  providers: ['kubernetes'],
  nodeDataDefaults: {
    iceType: 'Monitoring.Log',
  },
});
