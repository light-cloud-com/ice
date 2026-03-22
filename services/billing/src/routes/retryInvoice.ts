/**
 * Retry Invoice Payment
 *
 * Retry creating a Stripe invoice and charging for a pending invoice
 * Used when an invoice was created but Stripe processing failed
 */

import { Request, Response } from 'express';
import { User } from '@prisma/client';
import prisma from '../../lib/prisma';
import { retryInvoicePayment } from '../../services/invoiceService';
import { checkPermissions } from '../../utils/checkPermissions';
import { errorHandler } from '../../errorHandler';
import { Permission } from '../../const/permissions';

interface AuthenticatedRequest extends Request {
  user: User;
  body: {
    invoiceId: string;
  };
}

/**
 * @swagger
 * /api/billing/invoice/retry:
 *   post:
 *     summary: Retry payment for a pending invoice
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
 *               invoiceId:
 *                 type: string
 *             required:
 *               - invoiceId
 *     responses:
 *       200:
 *         description: Retry result
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Invoice not found
 */
export const retryInvoice = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { invoiceId } = req.body;

    if (!invoiceId) {
      errorHandler({ res, message: 'Invoice ID is required' });
      return;
    }

    // Get the invoice to check organisation ownership
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }

    // Check permissions - owner only can retry payments
    const permissionCheck = await checkPermissions({
      id: req.user.id,
      email: req.user.email,
      organisationId: invoice.organisation_id,
      permissionName: Permission.MANAGE_BILLING,
    });

    if (permissionCheck.error) {
      errorHandler({ res, message: permissionCheck.error });
      return;
    }

    if (!permissionCheck.hasPermission) {
      errorHandler({
        res,
        message: 'Only the organisation owner can retry invoice payments',
      });
      return;
    }

    // Retry the payment
    const result = await retryInvoicePayment(invoiceId);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          stripeInvoiceId: result.stripeInvoiceId,
        },
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
        data: {
          stripeInvoiceId: result.stripeInvoiceId,
        },
      });
    }
  } catch (error) {
    console.error('Error retrying invoice payment:', error);
    errorHandler({
      res,
      message: 'Failed to retry invoice payment',
      error,
    });
  }
};
