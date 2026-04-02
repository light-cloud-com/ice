import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const awsScheduledTaskBlueprint: BlockBlueprint = createBlueprintFromResource('scheduled-task', {
  iceType: 'Compute.CronJob',
  category: 'backend',
  name: 'AWS Scheduled Task',
  description: 'AWS EventBridge + Lambda. Cron jobs: reports, cleanup.',
  icon: 'Clock',
  providers: ['aws'],
  nodeDataDefaults: {
    schedule: 'daily',
  },
});
