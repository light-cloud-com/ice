/**
 * Scheduled Jobs for Billing
 *
 * These endpoints are called by Cloud Scheduler (or cron) to:
 * 1. Daily: Snapshot usage for all organisations
 * 2. Monthly: Generate invoices for all organisations
 * 3. Every 5 minutes: Poll Cloud Run instance counts for scale-to-zero billing
 * 4. Daily: Check for expired trials and handle conversion/expiration
 */

import { Request, Response } from 'express';
import { snapshotDailyUsage } from '../../services/usageTrackingService';
import { generateAllMonthlyInvoices } from '../../services/invoiceService';
import { pollAndRecordScalingEvents } from '../../services/scalingTrackingService';
import { getExpiredTrials, convertTrialToPaid, expireTrial, hasPaymentMethod } from '../../services/trialService';

import prisma from '../../lib/prisma';
// API key check for scheduled jobs — always required
const verifySchedulerAuth = (req: Request): boolean => {
  const authHeader = req.headers.authorization;
  const schedulerKey = process.env.SCHEDULER_API_KEY;

  // Deny access if no key is configured — prevents unauthenticated access in production
  if (!schedulerKey) {
    console.warn('[Billing] SCHEDULER_API_KEY not configured — all scheduled job requests will be rejected');
    return false;
  }

  return authHeader === `Bearer ${schedulerKey}`;
};

/**
 * @swagger
 * /api/billing/jobs/daily-snapshot:
 *   post:
 *     summary: Run daily usage snapshot for all organisations
 *     tags: [Billing Jobs]
 *     description: Called by Cloud Scheduler at 23:59 UTC daily
 *     security:
 *       - schedulerAuth: []
 *     responses:
 *       200:
 *         description: Snapshot completed
 *       401:
 *         description: Unauthorized
 */
export const dailyUsageSnapshot = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!verifySchedulerAuth(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    console.log('[Billing Job] Starting daily usage snapshot...');

    // Get all organisations
    const organisations = await prisma.organisation.findMany({
      select: { id: true, name: true },
    });

    const results = {
      total: organisations.length,
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const org of organisations) {
      try {
        await snapshotDailyUsage(org.id);
        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(`${org.name}: ${error.message}`);
        console.error(`[Billing Job] Failed to snapshot org ${org.id}:`, error);
      }
    }

    console.log(`[Billing Job] Daily snapshot complete: ${results.success}/${results.total} successful`);

    res.status(200).json({
      success: true,
      message: 'Daily usage snapshot completed',
      results,
    });
  } catch (error) {
    console.error('[Billing Job] Daily snapshot failed:', error);
    res.status(500).json({
      error: 'Daily snapshot failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * @swagger
 * /api/billing/jobs/generate-invoices:
 *   post:
 *     summary: Generate monthly invoices for all organisations
 *     tags: [Billing Jobs]
 *     description: Called by Cloud Scheduler on the 1st of each month
 *     security:
 *       - schedulerAuth: []
 *     responses:
 *       200:
 *         description: Invoices generated
 *       401:
 *         description: Unauthorized
 */
export const generateMonthlyInvoices = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!verifySchedulerAuth(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    console.log('[Billing Job] Starting monthly invoice generation...');

    const results = await generateAllMonthlyInvoices();

    console.log(
      `[Billing Job] Invoice generation complete: ${results.generated} generated, ${results.skipped} skipped`,
    );

    res.status(200).json({
      success: true,
      message: 'Monthly invoice generation completed',
      results: {
        generated: results.generated,
        skipped: results.skipped,
        errors: results.errors,
      },
    });
  } catch (error) {
    console.error('[Billing Job] Invoice generation failed:', error);
    res.status(500).json({
      error: 'Invoice generation failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * @swagger
 * /api/billing/jobs/check-spending-limits:
 *   post:
 *     summary: Check spending limits and send alerts
 *     tags: [Billing Jobs]
 *     description: Called periodically to check if any org is approaching spending limit
 *     security:
 *       - schedulerAuth: []
 *     responses:
 *       200:
 *         description: Checks completed
 *       401:
 *         description: Unauthorized
 */
export const checkSpendingLimits = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!verifySchedulerAuth(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    console.log('[Billing Job] Checking spending limits...');

    // Get all organisations with spending limits or budget alerts configured
    const billings = await prisma.billing.findMany({
      where: {
        OR: [{ spending_limit: { not: null } }, { budget_alert_threshold: { not: null } }],
      },
      include: {
        organisation: {
          select: { id: true, name: true, owner_id: true },
        },
      },
    });

    const alerts: Array<{
      organisationId: string;
      organisationName: string;
      type: 'approaching_limit' | 'limit_exceeded' | 'budget_alert';
      currentSpend: number;
      threshold: number;
    }> = [];

    for (const billing of billings) {
      // Calculate current spend (simplified - in production, use calculateCurrentCharges)
      const currentMonth = new Date();
      const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);

      const usageRecords = await prisma.usageRecord.findMany({
        where: {
          organisation_id: billing.organisation_id,
          date: { gte: startOfMonth },
        },
      });

      // Estimate current spend based on usage
      // This is a simplified calculation - use calculateCurrentCharges for accuracy
      const estimatedSpend = usageRecords.reduce((total, record) => {
        return total + record.build_minutes * 0.025; // Just build minutes for now
      }, 0);

      // Check budget alert threshold
      if (billing.budget_alert_threshold) {
        const threshold = Number(billing.budget_alert_threshold);
        if (estimatedSpend >= threshold) {
          alerts.push({
            organisationId: billing.organisation_id,
            organisationName: billing.organisation.name,
            type: 'budget_alert',
            currentSpend: estimatedSpend,
            threshold,
          });
        }
      }

      // Check spending limit
      if (billing.spending_limit) {
        const limit = Number(billing.spending_limit);
        if (estimatedSpend >= limit) {
          alerts.push({
            organisationId: billing.organisation_id,
            organisationName: billing.organisation.name,
            type: 'limit_exceeded',
            currentSpend: estimatedSpend,
            threshold: limit,
          });
        } else if (estimatedSpend >= limit * 0.8) {
          alerts.push({
            organisationId: billing.organisation_id,
            organisationName: billing.organisation.name,
            type: 'approaching_limit',
            currentSpend: estimatedSpend,
            threshold: limit,
          });
        }
      }
    }

    // TODO: Send email notifications for alerts
    // For now, just log them
    if (alerts.length > 0) {
      console.log('[Billing Job] Spending alerts:', alerts);
    }

    res.status(200).json({
      success: true,
      message: 'Spending limit checks completed',
      alertsGenerated: alerts.length,
      alerts,
    });
  } catch (error) {
    console.error('[Billing Job] Spending limit check failed:', error);
    res.status(500).json({
      error: 'Spending limit check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * @swagger
 * /api/billing/jobs/poll-scaling:
 *   post:
 *     summary: Poll Cloud Run instance counts and record scaling events
 *     tags: [Billing Jobs]
 *     description: |
 *       Called by Cloud Scheduler every 5 minutes to track when services
 *       scale up (0->1+ instances) or scale down (1+->0 instances).
 *       Used for scale-to-zero aware billing.
 *     security:
 *       - schedulerAuth: []
 *     responses:
 *       200:
 *         description: Polling completed
 *       401:
 *         description: Unauthorized
 */
export const pollScalingEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!verifySchedulerAuth(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    console.log('[Billing Job] Starting scaling events poll...');

    const results = await pollAndRecordScalingEvents();

    console.log(
      `[Billing Job] Scaling poll complete: ${results.polled} polled, ${results.scaledUp} scaled up, ${results.scaledDown} scaled down`,
    );

    res.status(200).json({
      success: true,
      message: 'Scaling events poll completed',
      results,
    });
  } catch (error) {
    console.error('[Billing Job] Scaling poll failed:', error);
    res.status(500).json({
      error: 'Scaling poll failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * @swagger
 * /api/billing/jobs/check-trial-expirations:
 *   post:
 *     summary: Check for expired trials and handle conversion/expiration
 *     tags: [Billing Jobs]
 *     description: |
 *       Called daily to check for trials that have expired.
 *       - If user has payment method: auto-convert to paid
 *       - If no payment method: expire the trial
 *     security:
 *       - schedulerAuth: []
 *     responses:
 *       200:
 *         description: Trial check completed
 *       401:
 *         description: Unauthorized
 */
export const checkTrialExpirations = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!verifySchedulerAuth(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    console.log('[Billing Job] Checking trial expirations...');

    const expiredTrials = await getExpiredTrials();

    const results = {
      total: expiredTrials.length,
      converted: 0,
      expired: 0,
      errors: [] as string[],
    };

    for (const trial of expiredTrials) {
      try {
        const hasPayment = await hasPaymentMethod(trial.userId);

        if (hasPayment) {
          // Convert to paid - user has payment method
          await convertTrialToPaid(trial.userId);
          results.converted++;
          console.log(`[Billing Job] Trial converted to paid for user ${trial.userId} (${trial.email})`);
          // TODO: Send conversion success email
        } else {
          // Expire trial - no payment method
          await expireTrial(trial.userId);
          results.expired++;
          console.log(`[Billing Job] Trial expired for user ${trial.userId} (${trial.email}) - no payment method`);
          // TODO: Send trial expired email with upgrade prompt
        }
      } catch (error: any) {
        results.errors.push(`${trial.userId}: ${error.message}`);
        console.error(`[Billing Job] Failed to process trial for user ${trial.userId}:`, error);
      }
    }

    console.log(
      `[Billing Job] Trial expiration check complete: ${results.converted} converted, ${results.expired} expired`,
    );

    res.status(200).json({
      success: true,
      message: 'Trial expiration check completed',
      results,
    });
  } catch (error) {
    console.error('[Billing Job] Trial expiration check failed:', error);
    res.status(500).json({
      error: 'Trial expiration check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
