import { Router } from 'express';
import githubRoutes from './routes/github.js';
import providerRoutes from './routes/providers.js';
export * from './services/provider.service.js';
export * from './services/github.service.js';

export function createCredentialsRouter(): Router {
  const router = Router();
  router.use('/providers', providerRoutes);
  router.use('/github', githubRoutes);
  return router;
}
