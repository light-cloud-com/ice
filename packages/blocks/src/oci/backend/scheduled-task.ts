import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const ociScheduledTaskBlueprint: BlockBlueprint = createBlueprintFromResource(
  'scheduled-task',
  {
    blockType: 'oci-scheduled-task',
    category: 'backend',
    name: 'OCI Scheduled Task',
    description: 'Oracle Cloud Functions + Resource Scheduler. Cron jobs: reports, cleanup.',
    icon: 'Clock',
    providers: ['oci'],
    nodeDataDefaults: {
      iceType: 'Application.CronJob',
      schedule: 'daily',
    },
  }
);
