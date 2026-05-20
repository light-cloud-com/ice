import { createBlueprintFromResource } from '@ice/core/resources';
import type { ConceptBlueprint } from '../_shared/types';

export const scheduledTaskConceptBlueprint: ConceptBlueprint = {
  ...createBlueprintFromResource('scheduled-task', {
    iceType: 'Compute.CronJob',
    category: 'backend',
    name: 'Scheduled Task',
    description: 'Cron job. Runs code on a schedule (every hour, daily at 3am, weekly Monday mornings).',
    icon: 'Clock',
    providers: ['aws', 'gcp', 'azure'],
    nodeDataDefaults: {
      label: 'Scheduled Task',
      schedule: '0 3 * * *',
      runtime: 'node20',
      timeout: 300,
    },
  }),
  conceptId: 'scheduled-task',
  visualFamily: 'compute',
};
