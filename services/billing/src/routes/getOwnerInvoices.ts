/**
 * Get invoices for all organisations owned by the user
 */

import { Request, Response } from 'express';
import { User } from '@prisma/client';
import prisma from '../../lib/prisma';

interface AuthenticatedRequest extends Request {
  user: User;
}

export const getOwnerInvoices = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user.id;

    // Check if user owns any organisations
    const ownedOrgUsers = await prisma.organisationUsers.findMany({
      where: {
        user_id: userId,
        role: 'owner',
        status: 1,
      },
    });

    if (ownedOrgUsers.length === 0) {
      res.status(403).json({
        error: 'You do not own any organisations.',
      });
      return;
    }

    // Get all invoices for this user (invoices are now user-level)
    const invoices = await prisma.invoice.findMany({
      where: {
        user_id: userId,
      },
      orderBy: {
        created_at: 'desc',
      },
      include: {
        organisation: {
          select: { name: true },
        },
      },
    });

    // Format invoices for response
    const invoicesWithOrg = invoices.map((invoice) => ({
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      period_start: invoice.period_start,
      period_end: invoice.period_end,
      line_items: invoice.line_items,
      subtotal: Number(invoice.subtotal),
      credits_applied: Number(invoice.credits_applied),
      tax: Number(invoice.tax),
      total: Number(invoice.total),
      status: invoice.status,
      due_date: invoice.due_date,
      paid_at: invoice.paid_at,
      pdf_url: invoice.pdf_url,
      stripe_invoice_id: invoice.stripe_invoice_id,
      created_at: invoice.created_at,
      updated_at: invoice.updated_at,
      organisation_id: invoice.organisation_id,
      organisation_name: invoice.organisation?.name || 'All Organisations',
    }));

    res.json({
      data: invoicesWithOrg,
    });
  } catch (error) {
    console.error('[Billing] Error getting owner invoices:', error);
    res.status(500).json({
      error: 'Failed to get invoices',
    });
  }
};
