import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const observabilityConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('log-group', {
    iceType: 'Monitoring.Log',
    category: 'observability',
    name: 'Observability',
    description: 'Logs, metrics, and alerts in one block. CloudWatch / Cloud Logging / App Insights.',
    icon: 'Activity',
    providers: ['aws', 'gcp', 'azure'],
    nodeDataDefaults: { label: 'Observability', retentionDays: 30 },
  }),
  conceptId: 'observability',
  visualFamily: 'edge',
};
