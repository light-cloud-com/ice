import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const gcpScheduledTaskBlueprint: BlockBlueprint = createBlueprintFromResource('scheduled-task', {
  blockType: 'gcp-scheduled-task',
  category: 'backend',
  name: 'GCP Scheduled Task',
  description: 'Google Cloud Scheduler. Cron jobs: reports, cleanup.',
  icon: 'Clock',
  providers: ['gcp'],
  nodeDataDefaults: {
    iceType: 'Application.CronJob',
    schedule: 'daily',
  },
});
