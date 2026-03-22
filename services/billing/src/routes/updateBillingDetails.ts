/**
 * Update Billing Details
 *
 * Update billing address, company info, and tax details - Owner only
 * Now uses user-level billing (one billing record per user, covers all their orgs)
 */

import { Request, Response } from 'express';
import { User } from '@prisma/client';
import { updateUserBillingDetails, getUserBillingDetails } from '../../services/stripeService';
import { checkPermissions } from '../../utils/checkPermissions';
import { errorHandler } from '../../errorHandler';
import { Permission } from '../../const/permissions';
import prisma from '../../lib/prisma';

interface AuthenticatedRequest extends Request {
  user: User;
  body: {
    targetOrganisationId: string;
    is_company: boolean;
    company_name?: string;
    billing_email?: string;
    phone?: string;
    address_first_name: string;
    address_last_name: string;
    address_street: string;
    address_street_number: string;
    address_apartment_number?: string;
    address_city: string;
    address_post_code: string;
    address_country: string;
    tin?: string;
    vat_number?: string;
  };
}

/**
 * @swagger
 * /api/billing/details:
 *   post:
 *     summary: Update billing details
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
 *               is_company:
 *                 type: boolean
 *                 description: True for business, false for individual
 *               company_name:
 *                 type: string
 *                 description: Required if is_company is true
 *               billing_email:
 *                 type: string
 *                 description: Email for invoice delivery
 *               phone:
 *                 type: string
 *               address_first_name:
 *                 type: string
 *               address_last_name:
 *                 type: string
 *               address_street:
 *                 type: string
 *               address_street_number:
 *                 type: string
 *               address_apartment_number:
 *                 type: string
 *               address_city:
 *                 type: string
 *               address_post_code:
 *                 type: string
 *               address_country:
 *                 type: string
 *                 description: ISO 3166-1 alpha-2 country code
 *               tin:
 *                 type: string
 *                 description: Tax Identification Number
 *               vat_number:
 *                 type: string
 *                 description: EU VAT number (e.g., PL1234567890)
 *             required:
 *               - targetOrganisationId
 *               - is_company
 *               - address_first_name
 *               - address_last_name
 *               - address_street
 *               - address_street_number
 *               - address_city
 *               - address_post_code
 *               - address_country
 *     responses:
 *       200:
 *         description: Billing details updated
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
export const updateBillingDetailsRoute = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      targetOrganisationId,
      is_company,
      company_name,
      billing_email,
      phone,
      address_first_name,
      address_last_name,
      address_street,
      address_street_number,
      address_apartment_number,
      address_city,
      address_post_code,
      address_country,
      tin,
      vat_number,
    } = req.body;

    if (!targetOrganisationId) {
      errorHandler({
        res,
        message: 'Organisation ID is required',
        statusCode: 400,
      });
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
        message: 'Only the organisation owner can manage billing details',
      });
      return;
    }

    // Validate required fields
    if (!address_first_name || !address_last_name) {
      errorHandler({
        res,
        message: 'First name and last name are required',
        statusCode: 400,
      });
      return;
    }

    if (!address_street || !address_city || !address_post_code || !address_country) {
      errorHandler({
        res,
        message: 'Complete address is required',
        statusCode: 400,
      });
      return;
    }

    if (is_company && !company_name) {
      errorHandler({
        res,
        message: 'Company name is required for business customers',
        statusCode: 400,
      });
      return;
    }

    // Validate VAT number format if provided (basic EU format)
    if (vat_number && !/^[A-Z]{2}[A-Z0-9]{2,12}$/.test(vat_number)) {
      errorHandler({
        res,
        message:
          'Invalid VAT number format. Expected format: 2 letter country code followed by VAT number (e.g., PL1234567890)',
        statusCode: 400,
      });
      return;
    }

    // Update user-level billing details (one record per user, covers all their orgs)
    await updateUserBillingDetails(req.user.id, {
      is_company,
      company_name,
      billing_email,
      phone,
      address_first_name,
      address_last_name,
      address_street,
      address_street_number: address_street_number || '',
      address_apartment_number,
      address_city,
      address_post_code,
      address_country,
      tin,
      vat_number,
    });

    // Get updated billing details
    const updatedDetails = await getUserBillingDetails(req.user.id);

    res.status(200).json({
      success: true,
      data: updatedDetails,
    });
  } catch (error) {
    console.error('Error updating billing details:', error);
    errorHandler({
      res,
      message: error instanceof Error ? error.message : 'Failed to update billing details',
      error,
    });
  }
};

/**
 * @swagger
 * /api/billing/details:
 *   get:
 *     summary: Get billing details
 *     security:
 *       - bearerAuth: []
 *     tags: [Billing]
 */
export const getBillingDetailsRoute = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { targetOrganisationId } = req.body;

    // For user-level billing, we still accept targetOrganisationId for permission checking
    // but the billing details are stored per-user
    if (!targetOrganisationId) {
      errorHandler({
        res,
        message: 'Organisation ID is required',
        statusCode: 400,
      });
      return;
    }

    // Check permissions - user must be owner of the org to access billing
    const permissionCheck = await checkPermissions({
      id: req.user.id,
      email: req.user.email,
      organisationId: targetOrganisationId,
      permissionName: Permission.READ_BILLING,
    });

    if (permissionCheck.error || !permissionCheck.hasPermission) {
      errorHandler({
        res,
        message: 'You do not have permission to view billing details',
      });
      return;
    }

    // Get user-level billing details
    const details = await getUserBillingDetails(req.user.id);

    res.status(200).json({
      success: true,
      data: details,
    });
  } catch (error) {
    console.error('Error getting billing details:', error);
    errorHandler({
      res,
      message: 'Failed to get billing details',
      error,
    });
  }
};
