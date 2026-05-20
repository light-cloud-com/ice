import { Router } from 'express';
import authRoutes from './routes/auth';
import onboardingRoutes from './routes/onboarding';
import organisationRoutes from './routes/organisations';
import profileRoutes from './routes/profile';
export { AuthError } from './services/auth.service';
export * from './services/project-access.service';
export * from './services/email.service';
export { seedAcmeDemo, seedDemoIfEmpty } from './services/seed-demo.service';

export function createIamRouter(): Router {
  const router = Router();
  router.use('/auth', authRoutes);
  router.use('/profile', profileRoutes);
  router.use('/organisations', organisationRoutes);
  router.use('/onboarding', onboardingRoutes);
  return router;
}
