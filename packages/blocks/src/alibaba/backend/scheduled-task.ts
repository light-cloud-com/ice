import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const alibabaScheduledTaskBlueprint: BlockBlueprint = createBlueprintFromResource(
  'scheduled-task',
  {
    blockType: 'alibaba-scheduled-task',
    category: 'backend',
    name: 'Alibaba Scheduled Task',
    description: 'Alibaba Cloud SchedulerX. Cron jobs: reports, cleanup.',
    icon: 'Clock',
    providers: ['alibaba'],
    nodeDataDefaults: {
      iceType: 'Application.CronJob',
      schedule: 'daily',
    },
  }
);
