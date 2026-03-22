import { createBlueprintFromResource } from '@ice/core/resources';
import type { BlockBlueprint } from '../../types';

export const azureScheduledTaskBlueprint: BlockBlueprint = createBlueprintFromResource(
  'scheduled-task',
  {
    blockType: 'azure-scheduled-task',
    category: 'backend',
    name: 'Azure Scheduled Task',
    description: 'Azure Functions Timer Trigger. Cron jobs: reports, cleanup.',
    icon: 'Clock',
    providers: ['azure'],
    nodeDataDefaults: {
      iceType: 'Application.CronJob',
      schedule: 'daily',
    },
  }
);
