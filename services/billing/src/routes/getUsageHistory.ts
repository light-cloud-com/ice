/**
 * Get Usage History
 *
 * Returns daily usage data for chart display
 */

import { Response } from 'express';
import { checkPermissions } from '../../utils/checkPermissions';
import { errorMessages } from '../../const/messages';
import { errorHandler } from '../../errorHandler';
import { getDailyUsageHistory } from '../../services/billingService';

interface AuthenticatedRequest {
  user: { id: string; email: string };
  body: {
    targetOrganisationId: string;
    days?: number;
  };
}

export const getUsageHistory = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { targetOrganisationId, days = 30 } = req.body;

    if (!targetOrganisationId) {
      errorHandler({
        res,
        message: 'Organisation ID is required.',
      });
      return;
    }

    // Check permissions
    const hasPermission = await checkPermissions({
      id: req.user.id,
      email: req.user.email,
      organisationId: targetOrganisationId,
      permissionName: 'read:billing',
    });

    if (hasPermission.error) {
      errorHandler({ res, message: hasPermission.error });
      return;
    }

    if (!hasPermission.hasPermission) {
      errorHandler({
        res,
        message: errorMessages.INSUFFICIENT_PERMISSIONS,
      });
      return;
    }

    // Get usage history
    const usageHistory = await getDailyUsageHistory(
      targetOrganisationId,
      Math.min(days, 90)
    );

    res.json({ history: usageHistory });
  } catch (error) {
    console.error('[Billing] Error getting usage history:', error);
    errorHandler({
      res,
      message: errorMessages.INTERNAL_SERVER_ERROR,
      error,
    });
  }
};
