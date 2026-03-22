import { Router } from 'express';
import deployRoutes from './routes/canvas-deploy.js';
import pipelineRoutes from './routes/pipeline.js';
import webhookRoutes from './routes/webhooks.js';
export { startDeployWorker, queueDeployment } from './services/queue.service.js';
export { startCronJobs } from './services/cron.service.js';
export * from './services/deploy.service.js';
export * from './services/pipeline.service.js';
export * from './services/build.service.js';

export function createDeployRouter(): Router {
  const router = Router();
  router.use('/canvas/deploy', deployRoutes);
  router.use('/pipeline', pipelineRoutes);
  router.use('/webhooks', webhookRoutes);
  return router;
}
