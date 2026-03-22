/**
 * Payment Method Management
 *
 * Handle adding, updating, and removing payment methods - Owner only
 * Now uses user-level billing (one payment method per user, covers all their orgs)
 */

import { Request, Response } from 'express';
import { User } from '@prisma/client';
import prisma from '../../lib/prisma';
import {
  createUserSetupIntent,
  attachUserPaymentMethod,
  removeUserPaymentMethod,
  getUserBilling,
  isStripeConfigured,
} from '../../services/stripe-service';
import { checkPermissions } from '../../utils/check-permissions';
import { errorHandler } from '../../error-handler';
import { Permission } from '../../const/permissions';

interface AuthenticatedRequest extends Request {
  user: User;
  body: {
    targetOrganisationId: string;
    paymentMethodId?: string;
  };
}

/**
 * @swagger
 * /api/billing/payment-method/setup:
 *   post:
 *     summary: Create a setup intent for adding a payment method
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
 *         description: Setup intent created
 *       401:
 *         description: Unauthorized
 */
export const createSetupIntent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { targetOrganisationId } = req.body;

    if (!targetOrganisationId) {
      errorHandler({ res, message: 'Organisation ID is required' });
      return;
    }

    if (!isStripeConfigured()) {
      errorHandler({ res, message: 'Payment processing is not configured' });
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
        message: 'Only the organisation owner can manage payment methods',
      });
      return;
    }

    // Check if user has billing details (Stripe customer)
    const userBilling = await getUserBilling(req.user.id);
    if (!userBilling?.stripe_customer_id) {
      errorHandler({
        res,
        message: 'Please save billing details first before adding a payment method',
        statusCode: 400,
      });
      return;
    }

    // Create setup intent for the user
    const { clientSecret } = await createUserSetupIntent(req.user.id);

    res.status(200).json({
      success: true,
      data: { clientSecret },
    });
  } catch (error) {
    console.error('Error creating setup intent:', error);
    errorHandler({
      res,
      message: 'Failed to create setup intent',
      error,
    });
  }
};

/**
 * @swagger
 * /api/billing/payment-method:
 *   post:
 *     summary: Attach a payment method
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
 *               paymentMethodId:
 *                 type: string
 *             required:
 *               - targetOrganisationId
 *               - paymentMethodId
 *     responses:
 *       200:
 *         description: Payment method attached
 *       401:
 *         description: Unauthorized
 */
export const updatePaymentMethod = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { targetOrganisationId, paymentMethodId } = req.body;

    if (!targetOrganisationId) {
      errorHandler({ res, message: 'Organisation ID is required' });
      return;
    }

    if (!paymentMethodId) {
      errorHandler({ res, message: 'Payment method ID is required' });
      return;
    }

    if (!isStripeConfigured()) {
      errorHandler({ res, message: 'Payment processing is not configured' });
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
        message: 'Only the organisation owner can manage payment methods',
      });
      return;
    }

    // Attach payment method to user
    const paymentMethod = await attachUserPaymentMethod(req.user.id, paymentMethodId);

    res.status(200).json({
      success: true,
      data: paymentMethod,
    });
  } catch (error) {
    console.error('Error attaching payment method:', error);
    errorHandler({
      res,
      message: 'Failed to attach payment method',
      error,
    });
  }
};

/**
 * @swagger
 * /api/billing/payment-method/remove:
 *   post:
 *     summary: Remove payment method
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
 *         description: Payment method removed
 *       401:
 *         description: Unauthorized
 */
export const removePaymentMethod = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { targetOrganisationId } = req.body;

    if (!targetOrganisationId) {
      errorHandler({ res, message: 'Organisation ID is required' });
      return;
    }

    if (!isStripeConfigured()) {
      errorHandler({ res, message: 'Payment processing is not configured' });
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
        message: 'Only the organisation owner can manage payment methods',
      });
      return;
    }

    await removeUserPaymentMethod(req.user.id);

    res.status(200).json({
      success: true,
      message: 'Payment method removed',
    });
  } catch (error) {
    console.error('Error removing payment method:', error);
    errorHandler({
      res,
      message: 'Failed to remove payment method',
      error,
    });
  }
};
