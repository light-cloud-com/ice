import { Router } from 'express';

// Re-export services
export { default as billingRoutes } from './routes';

export async function createBillingRouter(): Promise<Router> {
  const router = Router();
  try {
    const mod = await import('./routes');
    router.use('/billing', mod.default);
    console.log('[billing] Billing routes loaded');
  } catch (err) {
    console.error('[billing] FAILED to load billing routes — billing is non-functional:', (err as Error).message);
    console.error('[billing] Stack:', (err as Error).stack);
    router.all('/billing/*', (_req, res) => {
      res.status(503).json({ error: 'Billing service failed to initialize' });
    });
  }
  return router;
}
