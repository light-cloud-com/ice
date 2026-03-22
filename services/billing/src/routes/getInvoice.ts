/**
 * Get Invoice
 *
 * Returns details of a specific invoice
 */

import { Request, Response } from 'express';
import { User, PrismaClient } from '@prisma/client';
import { getInvoice as getInvoiceService } from '../../services/invoiceService';
import { checkPermissions } from '../../utils/checkPermissions';
import { errorHandler } from '../../errorHandler';

import prisma from '../../lib/prisma';
interface AuthenticatedRequest extends Request {
  user: User;
  params: {
    invoiceId: string;
  };
  body: {
    targetOrganisationId?: string;
  };
}

/**
 * @swagger
 * /api/billing/invoice/{invoiceId}:
 *   post:
 *     summary: Get invoice details
 *     security:
 *       - bearerAuth: []
 *     tags: [Billing]
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invoice details
 *       404:
 *         description: Invoice not found
 *       401:
 *         description: Unauthorized
 */
export const getInvoice = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { invoiceId } = req.params;

    if (!invoiceId) {
      errorHandler({ res, message: 'Invoice ID is required' });
      return;
    }

    // Get invoice
    const invoice = await getInvoiceService(invoiceId);

    if (!invoice) {
      errorHandler({ res, message: 'Invoice not found', statusCode: 404 });
      return;
    }

    // Check permissions for the invoice's organisation
    const hasPermission = await checkPermissions({
      id: req.user.id,
      email: req.user.email,
      organisationId: invoice.organisation_id,
      permissionName: 'read:billing',
    });

    // User can access if: they own the invoice, have permission, or are super admin
    const isInvoiceOwner = invoice.user_id === req.user.id;

    if (!isInvoiceOwner && !hasPermission.hasPermission && !hasPermission.isSuper) {
      const membership = await prisma.organisationUsers.findFirst({
        where: {
          user_id: req.user.id,
          organisation_id: invoice.organisation_id,
          status: 1,
        },
      });

      if (!membership) {
        errorHandler({
          res,
          message: 'You do not have access to this invoice',
        });
        return;
      }
    }

    // Get organisation and user billing details for full invoice view
    const [organisation, userBilling] = await Promise.all([
      prisma.organisation.findUnique({
        where: { id: invoice.organisation_id },
        select: { id: true, name: true },
      }),
      prisma.userBilling.findUnique({
        where: { user_id: invoice.user_id },
        select: {
          is_company: true,
          company_name: true,
          billing_email: true,
          phone: true,
          address_first_name: true,
          address_last_name: true,
          address_street: true,
          address_street_number: true,
          address_apartment_number: true,
          address_city: true,
          address_post_code: true,
          address_country: true,
          tin: true,
          vat_number: true,
        },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        ...invoice,
        organisation_name: organisation?.name || 'Unknown Organisation',
        billing_details: userBilling || null,
      },
    });
  } catch (error) {
    console.error('Error getting invoice:', error);
    errorHandler({
      res,
      message: 'Failed to get invoice',
      error,
    });
  }
};
