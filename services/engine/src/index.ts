import { Router } from 'express';
import schemaRoutes from './routes/schemas.js';
import resourceRoutes from './routes/resources.js';
export * from './services/schema.service.js';
export * from './services/resource.service.js';

export function createEngineRouter(): Router {
  const router = Router();
  router.use('/schemas', schemaRoutes);
  router.use('/resources', resourceRoutes);
  return router;
}
