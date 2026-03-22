/**
 * Update Billing Settings
 *
 * Update spending limits and budget alerts - Owner only
 */

import { Request, Response } from 'express';
import { User, PrismaClient } from '@prisma/client';
import { updateBillingSettings } from '../../services/billingService';
import { checkPermissions } from '../../utils/checkPermissions';
import { errorHandler } from '../../errorHandler';
import { Permission } from '../../const/permissions';

import prisma from '../../lib/prisma';
interface AuthenticatedRequest extends Request {
  user: User;
  body: {
    targetOrganisationId: string;
    spending_limit?: number | null;
    budget_alert_threshold?: number | null;
  };
}

/**
 * @swagger
 * /api/billing/settings:
 *   post:
 *     summary: Update billing settings
 *     security:
 *       - bearerAuth: []
 *     tags: [Billing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               targetOrganisationId:
 *                 type: string
 *               spending_limit:
 *                 type: number
 *                 nullable: true
 *                 description: Maximum monthly spend (null to remove limit)
 *               budget_alert_threshold:
 *                 type: number
 *                 nullable: true
 *                 description: Send alert when spending reaches this amount
 *             required:
 *               - targetOrganisationId
 *     responses:
 *       200:
 *         description: Settings updated
 *       401:
 *         description: Unauthorized
 */
export const updateSettings = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { targetOrganisationId, spending_limit, budget_alert_threshold } =
      req.body;

    if (!targetOrganisationId) {
      errorHandler({ res, message: 'Organisation ID is required' });
      return;
    }

    // Check permissions - owner only can manage billing
    const permissionCheck = await checkPermissions({
      id: req.user.id,
      email: req.user.email,
      organisationId: targetOrganisationId,
      permissionName: Permission.MANAGE_BILLING,
    });

    if (permissionCheck.error) {
      errorHandler({ res, message: permissionCheck.error });
      return;
    }

    if (!permissionCheck.hasPermission) {
      errorHandler({
        res,
        message: 'Only the organisation owner can manage billing settings',
      });
      return;
    }

    // Validate values
    if (
      spending_limit !== undefined &&
      spending_limit !== null &&
      spending_limit < 0
    ) {
      errorHandler({
        res,
        message: 'Spending limit must be a positive number',
      });
      return;
    }

    if (
      budget_alert_threshold !== undefined &&
      budget_alert_threshold !== null &&
      budget_alert_threshold < 0
    ) {
      errorHandler({
        res,
        message: 'Budget alert threshold must be a positive number',
      });
      return;
    }

    // Update settings
    await updateBillingSettings(targetOrganisationId, {
      spending_limit,
      budget_alert_threshold,
    });

    // Get updated billing info
    const billing = await prisma.billing.findUnique({
      where: { organisation_id: targetOrganisationId },
    });

    res.status(200).json({
      success: true,
      data: {
        spending_limit: billing?.spending_limit
          ? Number(billing.spending_limit)
          : null,
        budget_alert_threshold: billing?.budget_alert_threshold
          ? Number(billing.budget_alert_threshold)
          : null,
      },
    });
  } catch (error) {
    console.error('Error updating billing settings:', error);
    errorHandler({
      res,
      message: 'Failed to update billing settings',
      error,
    });
  }
};
