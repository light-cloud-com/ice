import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const digitaloceanScheduledTaskBlueprint: BlockBlueprint = createBlueprintFromResource(
  'scheduled-task',
  {
    blockType: 'digitalocean-scheduled-task',
    category: 'backend',
    name: 'DigitalOcean Scheduled Task',
    description: 'DigitalOcean Functions. Cron jobs: reports, cleanup.',
    icon: 'Clock',
    providers: ['digitalocean'],
    nodeDataDefaults: {
      iceType: 'Application.CronJob',
      schedule: 'daily',
    },
  }
);
