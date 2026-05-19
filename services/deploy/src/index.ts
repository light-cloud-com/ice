import { Router } from 'express';
import deployRoutes from './routes/canvas-deploy';
import logsRoutes from './routes/logs';
import pipelineRoutes from './routes/pipeline';
import webhookRoutes from './routes/webhooks';
export { startDeployWorker, queueDeployment, getDeployQueue } from './services/queue.service';
export { startCronJobs } from './services/cron.service';
export { cleanupAllTempDirs } from './services/deploy-locks';
export { startRequirementPoller, stopRequirementPoller } from './services/requirement-poller.service';
export { cleanupOrphanedIceResources } from './services/orphan-cleanup.service';
export * from './services/deploy.service';
export * from './services/pipeline.service';
export * from './services/build.service';

export function createDeployRouter(): Router {
  const router = Router();
  router.use('/canvas/deploy', deployRoutes);
  router.use('/canvas/logs', logsRoutes);
  router.use('/pipeline', pipelineRoutes);
  router.use('/webhooks', webhookRoutes);
  return router;
}
