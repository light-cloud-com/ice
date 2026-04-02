import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const ociScheduledTaskBlueprint: BlockBlueprint = createBlueprintFromResource('scheduled-task', {
  iceType: 'Compute.CronJob',
  category: 'backend',
  name: 'OCI Scheduled Task',
  description: 'Oracle Cloud Functions + Resource Scheduler. Cron jobs: reports, cleanup.',
  icon: 'Clock',
  providers: ['oci'],
  nodeDataDefaults: {
    schedule: 'daily',
  },
});
