/**
 * Stripe Webhook Handler
 *
 * Handles incoming Stripe webhook events
 */

import { Request, Response } from 'express';
import { handleWebhookEvent } from '../../services/stripe-service';

/**
 * @swagger
 * /api/billing/webhook/stripe:
 *   post:
 *     summary: Stripe webhook endpoint
 *     tags: [Billing]
 *     description: Receives webhook events from Stripe
 *     responses:
 *       200:
 *         description: Webhook processed
 *       400:
 *         description: Invalid webhook
 */
export const stripeWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      res.status(400).json({ error: 'Missing Stripe signature' });
      return;
    }

    // req.body should be the raw buffer for Stripe signature verification
    // This requires using express.raw() middleware for this route
    const payload = req.body;

    if (!Buffer.isBuffer(payload)) {
      // If body is not a buffer, it might be parsed JSON
      // Try to get raw body if available
      const rawBody = (req as any).rawBody;
      if (rawBody) {
        const result = await handleWebhookEvent(rawBody, signature);
        res.status(200).json({ received: true, type: result.type });
        return;
      }

      res.status(400).json({ error: 'Request body must be raw' });
      return;
    }

    const result = await handleWebhookEvent(payload, signature);

    res.status(200).json({ received: true, type: result.type });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    const message = error instanceof Error ? error.message : 'Webhook processing failed';
    res.status(400).json({ error: message });
  }
};

/**
 * Middleware to capture raw body for Stripe webhook verification
 * Add this to express app before body parsers for the webhook route
 *
 * Example usage in index.ts:
 *
 * app.use('/api/billing/webhook/stripe', express.raw({ type: 'application/json' }));
 * // ... other middleware
 * app.use('/api/billing', billingRoutes);
 */
export const captureRawBody = (req: Request, _res: Response, next: Function) => {
  let data = '';
  req.on('data', (chunk) => {
    data += chunk;
  });
  req.on('end', () => {
    (req as any).rawBody = Buffer.from(data);
    next();
  });
};
