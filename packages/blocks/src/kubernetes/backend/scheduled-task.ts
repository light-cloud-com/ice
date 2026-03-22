import { createBlueprintFromResource } from '@ice-engine/core/resources';
import type { BlockBlueprint } from '../../types';

export const kubernetesScheduledTaskBlueprint: BlockBlueprint = createBlueprintFromResource(
  'scheduled-task',
  {
    blockType: 'kubernetes-scheduled-task',
    category: 'backend',
    name: 'Kubernetes Scheduled Task',
    description: 'Kubernetes CronJob. Cron jobs: reports, cleanup.',
    icon: 'Clock',
    providers: ['kubernetes'],
    nodeDataDefaults: {
      iceType: 'Application.CronJob',
      schedule: 'daily',
    },
  }
);
