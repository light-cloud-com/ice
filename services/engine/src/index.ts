import { Router } from 'express';
import importRoutes from './routes/import';
import resourceRoutes from './routes/resources';
import schemaRoutes from './routes/schemas';
export * from './services/schema.service';
export {
  getAll,
  getForPalette,
  getByCategory,
  search,
  getLowLevel,
  getByProvider,
  getCategories as getResourceCategories,
} from './services/resource.service';

export function createEngineRouter(): Router {
  const router = Router();
  router.use('/schemas', schemaRoutes);
  router.use('/resources', resourceRoutes);
  router.use('/import', importRoutes);
  return router;
}
