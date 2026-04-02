import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const digitaloceanScheduledTaskBlueprint: BlockBlueprint = createBlueprintFromResource('scheduled-task', {
  iceType: 'Compute.CronJob',
  category: 'backend',
  name: 'DigitalOcean Scheduled Task',
  description: 'DigitalOcean Functions. Cron jobs: reports, cleanup.',
  icon: 'Clock',
  providers: ['digitalocean'],
  nodeDataDefaults: {
    schedule: 'daily',
  },
});
