import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesLogsBlueprint: BlockBlueprint = createBlueprintFromResource('log-group', {
  iceType: 'Monitoring.Log',
  category: 'observability',
  name: 'Kubernetes Logs',
  description: 'Kubernetes Fluentd/Loki. Errors, performance, alerts.',
  icon: 'FileText',
  providers: ['kubernetes'],
  nodeDataDefaults: {},
});
