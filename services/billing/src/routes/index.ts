/**
 * Billing Routes
 *
 * All billing-related API endpoints
 */

import { Router } from 'express';
import { requireAuth } from '@ice/shared';
import { getCurrentBilling } from './get-current-billing';
import { estimateCost } from './estimate-cost';
import { getUsage } from './get-usage';
import { getUsageHistory } from './get-usage-history';
import { listInvoices } from './list-invoices';
import { getInvoice } from './get-invoice';
import { updatePaymentMethod, createSetupIntent, removePaymentMethod } from './update-payment-method';
import { updateSettings } from './update-settings';
import { updateBillingDetailsRoute, getBillingDetailsRoute } from './update-billing-details';
import { stripeWebhook } from './stripe-webhook';
import {
  dailyUsageSnapshot,
  generateMonthlyInvoices,
  checkSpendingLimits,
  pollScalingEvents,
  checkTrialExpirations,
} from './scheduled-jobs';
import { getOwnerBilling } from './get-owner-billing';
import { getOwnerInvoices } from './get-owner-invoices';
import { retryInvoice } from './retry-invoice';

const router = Router();

// Authenticated routes

// Owner billing - get billing for all owned organisations
router.post('/owner-summary', requireAuth, (req, res) => getOwnerBilling(req as any, res));

// Owner invoices - get invoices for all owned organisations
router.post('/owner-invoices', requireAuth, (req, res) => getOwnerInvoices(req as any, res));

router.post('/current', requireAuth, (req, res) => getCurrentBilling(req as any, res));

router.post('/estimate', requireAuth, (req, res) => estimateCost(req as any, res));

router.post('/usage', requireAuth, (req, res) => getUsage(req as any, res));

router.post('/usage-history', requireAuth, (req, res) => getUsageHistory(req as any, res));

router.post('/invoices', requireAuth, (req, res) => listInvoices(req as any, res));

router.post('/invoice/:invoiceId', requireAuth, (req, res) => getInvoice(req as any, res));

// Retry payment for a pending invoice
router.post('/invoice/retry', requireAuth, (req, res) => retryInvoice(req as any, res));

router.post('/payment-method/setup', requireAuth, (req, res) => createSetupIntent(req as any, res));

router.post('/payment-method', requireAuth, (req, res) => updatePaymentMethod(req as any, res));

router.post('/payment-method/remove', requireAuth, (req, res) => removePaymentMethod(req as any, res));

router.post('/settings', requireAuth, (req, res) => updateSettings(req as any, res));

// Billing details (address, company info, tax)
router.post('/details', requireAuth, (req, res) => updateBillingDetailsRoute(req as any, res));

router.post('/details/get', requireAuth, (req, res) => getBillingDetailsRoute(req as any, res));

// Stripe webhook (no auth - uses Stripe signature verification)
router.post(
  '/webhook/stripe',
  // Use raw body for Stripe signature verification
  (req, res) => stripeWebhook(req, res),
);

// Scheduled job endpoints (called by Cloud Scheduler or cron)
// These use API key auth instead of JWT
router.post('/jobs/daily-snapshot', dailyUsageSnapshot);
router.post('/jobs/generate-invoices', generateMonthlyInvoices);
router.post('/jobs/check-spending-limits', checkSpendingLimits);
router.post('/jobs/poll-scaling', pollScalingEvents);
router.post('/jobs/check-trial-expirations', checkTrialExpirations);

export default router;
