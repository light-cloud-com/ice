/**
 * Get Usage
 *
 * Returns usage breakdown for billing period
 */

import { Request, Response } from 'express';
import { User } from '@prisma/client';
import {
  getCurrentMonthUsage,
  getDailyUsageBreakdown,
} from '../../services/usageTrackingService';
import { checkPermissions } from '../../utils/checkPermissions';
import { errorHandler } from '../../errorHandler';

import prisma from '../../lib/prisma';
interface AuthenticatedRequest extends Request {
  user: User;
  body: {
    targetOrganisationId: string;
    includeDaily?: boolean;
    days?: number;
  };
}

/**
 * @swagger
 * /api/billing/usage:
 *   post:
 *     summary: Get usage breakdown
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
 *               includeDaily:
 *                 type: boolean
 *                 description: Include daily breakdown for charts
 *               days:
 *                 type: number
 *                 description: Number of days for daily breakdown (default 30)
 *             required:
 *               - targetOrganisationId
 *     responses:
 *       200:
 *         description: Usage data
 *       401:
 *         description: Unauthorized
 */
export const getUsage = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { targetOrganisationId, includeDaily = false, days = 30 } = req.body;

    if (!targetOrganisationId) {
      errorHandler({ res, message: 'Organisation ID is required' });
      return;
    }

    // Check permissions
    const hasPermission = await checkPermissions({
      id: req.user.id,
      email: req.user.email,
      organisationId: targetOrganisationId,
      permissionName: 'read:billing',
    });

    if (!hasPermission.hasPermission && !hasPermission.isSuper) {
      const { PrismaClient } = await import('@prisma/client');
      const membership = await prisma.organisationUsers.findFirst({
        where: {
          user_id: req.user.id,
          organisation_id: targetOrganisationId,
          status: 1,
        },
      });

      if (!membership) {
        errorHandler({
          res,
          message: 'You do not have access to this organisation',
        });
        return;
      }
    }

    // Get current month usage
    const usage = await getCurrentMonthUsage(targetOrganisationId);

    // Optionally get daily breakdown
    let dailyBreakdown = null;
    if (includeDaily) {
      dailyBreakdown = await getDailyUsageBreakdown(targetOrganisationId, days);
    }

    res.status(200).json({
      success: true,
      data: {
        ...usage,
        daily: dailyBreakdown,
      },
    });
  } catch (error) {
    console.error('Error getting usage:', error);
    errorHandler({
      res,
      message: 'Failed to get usage data',
      error,
    });
  }
};
