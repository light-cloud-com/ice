import { Router } from 'express';
import importRoutes from './routes/import.js';
import resourceRoutes from './routes/resources.js';
import schemaRoutes from './routes/schemas.js';
export * from './services/schema.service.js';
export {
  getAll,
  getForPalette,
  getByCategory,
  search,
  getLowLevel,
  getByProvider,
  getCategories as getResourceCategories,
} from './services/resource.service.js';

export function createEngineRouter(): Router {
  const router = Router();
  router.use('/schemas', schemaRoutes);
  router.use('/resources', resourceRoutes);
  router.use('/import', importRoutes);
  return router;
}
