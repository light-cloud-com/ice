import { Router } from 'express';

// Re-export services
export { default as billingRoutes } from './routes/index.js';

export function createBillingRouter(): Router {
  const router = Router();
  // The billing routes from platform use their own Express router pattern
  // Import and mount them here
  try {
    const billingRoutes = require('./routes/index.js').default;
    router.use('/billing', billingRoutes);
  } catch {
    // Billing routes may need adaptation from platform patterns
    router.get('/billing/status', (_req, res) => {
      res.json({ status: 'billing_service_initializing' });
    });
  }
  return router;
}
