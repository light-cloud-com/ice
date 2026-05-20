import { Router } from 'express';
import githubRoutes from './routes/github';
import providerRoutes from './routes/providers';
export * from './services/provider.service';
export * from './services/github.service';

export function createCredentialsRouter(): Router {
  const router = Router();
  router.use('/providers', providerRoutes);
  router.use('/github', githubRoutes);
  return router;
}
