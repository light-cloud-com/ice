import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesLogTerminalBlueprint: BlockBlueprint = createBlueprintFromResource('log-group', {
  blockType: 'kubernetes-log-terminal',
  category: 'observability',
  name: 'Kubernetes Log Terminal',
  description: 'Kubernetes kubectl logs. Live streaming log viewer.',
  icon: 'Terminal',
  providers: ['kubernetes'],
  nodeDataDefaults: {
    iceType: 'Log.Terminal',
    serviceName: 'default',
  },
});
