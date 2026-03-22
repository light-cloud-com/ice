import { Router } from 'express';
import authRoutes from './routes/auth.js';
import oauthRoutes from './routes/oauth.js';
import profileRoutes from './routes/profile.js';
import organisationRoutes from './routes/organisations.js';
import userRoutes from './routes/users.js';
import onboardingRoutes from './routes/onboarding.js';
export { configurePassportOAuth } from './configs/passport-oauth.js';
export { AuthError } from './services/auth.service.js';
export * from './services/project-access.service.js';
export * from './services/email.service.js';

export function createIamRouter(): Router {
  const router = Router();
  router.use('/auth', authRoutes);
  router.use('/auth', oauthRoutes);
  router.use('/profile', profileRoutes);
  router.use('/organisations', organisationRoutes);
  router.use('/users', userRoutes);
  router.use('/onboarding', onboardingRoutes);
  return router;
}
