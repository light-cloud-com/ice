/**
 * Get Current Billing
 *
 * Returns current billing status including charges, credits, and payment info
 */

import { User } from '@prisma/client';
import { Request, Response } from 'express';
import { Permission } from '../../const/permissions';
import { errorHandler } from '../../error-handler';
import { getBillingSummary } from '../../services/billing-service';
import { checkPermissions } from '../../utils/check-permissions';

interface AuthenticatedRequest extends Request {
  user: User;
  body: {
    targetOrganisationId: string;
  };
}

/**
 * @swagger
 * /api/billing/current:
 *   post:
 *     summary: Get current billing status
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
 *             required:
 *               - targetOrganisationId
 *     responses:
 *       200:
 *         description: Current billing status
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
export const getCurrentBilling = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { targetOrganisationId } = req.body;

    if (!targetOrganisationId) {
      errorHandler({ res, message: 'Organisation ID is required' });
      return;
    }

    // Check permissions - admins and owners can view billing
    const permissionCheck = await checkPermissions({
      id: req.user.id,
      email: req.user.email,
      organisationId: targetOrganisationId,
      permissionName: Permission.READ_BILLING,
    });

    if (permissionCheck.error) {
      errorHandler({ res, message: permissionCheck.error });
      return;
    }

    if (!permissionCheck.hasPermission) {
      errorHandler({
        res,
        message: 'You do not have permission to view billing',
      });
      return;
    }

    const billing = await getBillingSummary(targetOrganisationId);

    res.status(200).json({
      success: true,
      data: billing,
    });
  } catch (error) {
    console.error('Error getting current billing:', error);
    errorHandler({
      res,
      message: 'Failed to get billing information',
      error,
    });
  }
};
