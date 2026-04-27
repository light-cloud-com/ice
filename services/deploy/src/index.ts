import { Router } from 'express';
import deployRoutes from './routes/canvas-deploy.js';
import logsRoutes from './routes/logs.js';
import pipelineRoutes from './routes/pipeline.js';
import webhookRoutes from './routes/webhooks.js';
export { startDeployWorker, queueDeployment, getDeployQueue } from './services/queue.service.js';
export { startCronJobs } from './services/cron.service.js';
export { cleanupAllTempDirs } from './services/deploy-locks.js';
export { startRequirementPoller, stopRequirementPoller } from './services/requirement-poller.service.js';
export { cleanupOrphanedIceResources } from './services/orphan-cleanup.service.js';
export * from './services/deploy.service.js';
export * from './services/pipeline.service.js';
export * from './services/build.service.js';

export function createDeployRouter(): Router {
  const router = Router();
  router.use('/canvas/deploy', deployRoutes);
  router.use('/canvas/logs', logsRoutes);
  router.use('/pipeline', pipelineRoutes);
  router.use('/webhooks', webhookRoutes);
  return router;
}
