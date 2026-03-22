/**
 * List Invoices
 *
 * Returns paginated list of invoices for an organisation
 */

import { Request, Response } from 'express';
import { User } from '@prisma/client';
import { listInvoices as listInvoicesService } from '../../services/invoiceService';
import { checkPermissions } from '../../utils/checkPermissions';
import { errorHandler } from '../../errorHandler';

import prisma from '../../lib/prisma';
interface AuthenticatedRequest extends Request {
  user: User;
  body: {
    targetOrganisationId: string;
    limit?: number;
    offset?: number;
    status?: string;
  };
}

/**
 * @swagger
 * /api/billing/invoices:
 *   post:
 *     summary: List invoices
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
 *               limit:
 *                 type: number
 *                 default: 20
 *               offset:
 *                 type: number
 *                 default: 0
 *               status:
 *                 type: string
 *                 enum: [draft, pending, paid, failed, void]
 *             required:
 *               - targetOrganisationId
 *     responses:
 *       200:
 *         description: List of invoices
 *       401:
 *         description: Unauthorized
 */
export const listInvoices = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { targetOrganisationId, limit = 20, offset = 0, status } = req.body;

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

    const result = await listInvoicesService(targetOrganisationId, {
      limit,
      offset,
      status,
    });

    res.status(200).json({
      success: true,
      data: result.invoices,
      pagination: {
        total: result.total,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Error listing invoices:', error);
    errorHandler({
      res,
      message: 'Failed to list invoices',
      error,
    });
  }
};
