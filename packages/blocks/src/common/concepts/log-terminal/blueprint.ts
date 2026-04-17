import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const logTerminalConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('log-group', {
    iceType: 'Monitoring.Terminal',
    category: 'observability',
    name: 'Log Terminal',
    description: 'Live-streaming log viewer on the canvas. Connects to a service and tails its logs in real time.',
    icon: 'Terminal',
    providers: ['aws', 'gcp', 'azure', 'kubernetes'],
    nodeDataDefaults: { label: 'Logs', serviceName: 'default' },
  }),
  conceptId: 'log-terminal',
  visualFamily: 'canvas-only',
  canvasOnly: true,
};
