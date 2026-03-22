import { Router } from 'express';
import providerRoutes from './routes/providers.js';
import githubRoutes from './routes/github.js';
export * from './services/provider.service.js';
export * from './services/github.service.js';

export function createCredentialsRouter(): Router {
  const router = Router();
  router.use('/providers', providerRoutes);
  router.use('/github', githubRoutes);
  return router;
}
