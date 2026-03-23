/**
 * Billing Routes
 *
 * All billing-related API endpoints
 */

import { requireAuth, requireOrgRole } from '@ice/shared';
import { Router, type Router as RouterType } from 'express';
import { estimateCost } from './estimate-cost';
import { getCurrentBilling } from './get-current-billing';
import { getInvoice } from './get-invoice';
import { getOwnerBilling } from './get-owner-billing';
import { getOwnerInvoices } from './get-owner-invoices';
import { getUsage } from './get-usage';
import { getUsageHistory } from './get-usage-history';
import { listInvoices } from './list-invoices';
import { retryInvoice } from './retry-invoice';
import {
  dailyUsageSnapshot,
  generateMonthlyInvoices,
  checkSpendingLimits,
  pollScalingEvents,
  checkTrialExpirations,
} from './scheduled-jobs';
import { stripeWebhook } from './stripe-webhook';
import { updateBillingDetailsRoute, getBillingDetailsRoute } from './update-billing-details';
import { updatePaymentMethod, createSetupIntent, removePaymentMethod } from './update-payment-method';
import { updateSettings } from './update-settings';

const router: RouterType = Router();

// Authenticated routes

// Owner billing - get billing for all owned organisations
router.post('/owner-summary', requireAuth, (req, res) => getOwnerBilling(req as any, res));

// Owner invoices - get invoices for all owned organisations
router.post('/owner-invoices', requireAuth, (req, res) => getOwnerInvoices(req as any, res));

router.post('/current', requireAuth, (req, res) => getCurrentBilling(req as any, res));

router.post('/estimate', requireAuth, (req, res) => estimateCost(req as any, res));

router.post('/usage', requireAuth, requireOrgRole('owner', 'admin'), (req, res) => getUsage(req as any, res));

router.post('/usage-history', requireAuth, requireOrgRole('owner', 'admin'), (req, res) => getUsageHistory(req as any, res));

router.post('/invoices', requireAuth, requireOrgRole('owner', 'admin'), (req, res) => listInvoices(req as any, res));

router.post('/invoice/:invoiceId', requireAuth, requireOrgRole('owner', 'admin'), (req, res) => getInvoice(req as any, res));

// Retry payment for a pending invoice — owner only
router.post('/invoice/retry', requireAuth, requireOrgRole('owner'), (req, res) => retryInvoice(req as any, res));

router.post('/payment-method/setup', requireAuth, requireOrgRole('owner'), (req, res) => createSetupIntent(req as any, res));

router.post('/payment-method', requireAuth, requireOrgRole('owner'), (req, res) => updatePaymentMethod(req as any, res));

router.post('/payment-method/remove', requireAuth, requireOrgRole('owner'), (req, res) => removePaymentMethod(req as any, res));

router.post('/settings', requireAuth, requireOrgRole('owner', 'admin'), (req, res) => updateSettings(req as any, res));

// Billing details (address, company info, tax) — owner/admin for write, read
router.post('/details', requireAuth, requireOrgRole('owner', 'admin'), (req, res) => updateBillingDetailsRoute(req as any, res));

router.post('/details/get', requireAuth, requireOrgRole('owner', 'admin'), (req, res) => getBillingDetailsRoute(req as any, res));

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
