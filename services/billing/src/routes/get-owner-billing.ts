/**
 * Get billing summary for all organisations owned by the user
 */

import { Request, Response } from 'express';
import { User } from '@prisma/client';
import prisma from '../../lib/prisma';

interface AuthenticatedRequest extends Request {
  user: User;
}
import { getBillingSummary } from '../../services/billing-service';
import { getTrialStatus } from '../../services/trial-service';
import { TRIAL_CONFIG } from '../../const/trial';

export interface OrganisationBillingSummary {
  organisation: {
    id: string;
    name: string;
  };
  billing: {
    active: {
      items: Array<{
        type: string;
        name?: string;
        quantity: number;
        unit_price: number;
        total: number;
        hours_used?: number;
        details?: Record<string, unknown>;
      }>;
      subtotal: number;
    };
    deleted: {
      items: Array<{
        type: string;
        name?: string;
        quantity: number;
        unit_price: number;
        total: number;
        hours_used?: number;
        details?: Record<string, unknown>;
      }>;
      subtotal: number;
    };
    usage: {
      items: Array<{
        type: string;
        name?: string;
        quantity: number;
        unit_price: number;
        total: number;
      }>;
      subtotal: number;
    };
    total: number;
    projected_monthly: number;
  };
}

export interface BillingDetails {
  is_company: boolean;
  company_name?: string | null;
  billing_email?: string | null;
  phone?: string | null;
  address_first_name: string;
  address_last_name: string;
  address_street: string;
  address_street_number: string;
  address_apartment_number?: string | null;
  address_city: string;
  address_post_code: string;
  address_country: string;
  tin?: string | null;
  vat_number?: string | null;
}

export interface TrialInfo {
  status: 'none' | 'active' | 'expired' | 'converted';
  is_active: boolean;
  days_remaining: number | null;
  end_date: string | null;
  start_date: string | null;
  resources_used: number;
  resources_limit: number;
  can_create_resource: boolean;
  limits: {
    max_resources: number;
    allowed_container_memory: string[];
    allowed_database_tiers: string[];
    static_site_storage_gb: number;
    static_site_bandwidth_gb: number;
  };
}

export interface OwnerBillingResponse {
  organisations: OrganisationBillingSummary[];
  totals: {
    actual: number;
    projected: number;
  };
  // Current billing period
  period: {
    start: string;
    end: string;
  };
  // Trial information
  trial?: TrialInfo;
  // Billing setup status
  billing_details_saved: boolean; // true if user has saved billing address/details
  stripe_customer_created: boolean; // true if Stripe customer exists
  billing_details?: BillingDetails | null; // The actual billing details if saved
  payment_method?: {
    last4: string;
    brand: string;
  } | null;
}

export const getOwnerBilling = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;

    // Get all organisations where user is owner
    const ownedOrgUsers = await prisma.organisationUsers.findMany({
      where: {
        user_id: userId,
        role: 'owner',
        status: 1,
      },
    });

    // Calculate current billing period
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // For users with no owned organisations, return empty billing data
    // This handles new users gracefully
    if (ownedOrgUsers.length === 0) {
      res.json({
        data: {
          organisations: [],
          totals: {
            actual: 0,
            projected: 0,
          },
          period: {
            start: periodStart.toISOString(),
            end: periodEnd.toISOString(),
          },
          billing_details_saved: false,
          stripe_customer_created: false,
          billing_details: null,
          payment_method: null,
        },
      });
      return;
    }

    // Get the organisation details
    const orgIds = ownedOrgUsers.map((o) => o.organisation_id);
    const organisations = await prisma.organisation.findMany({
      where: { id: { in: orgIds } },
    });
    const orgMap = new Map(organisations.map((o) => [o.id, o]));

    const organisationBillings: OrganisationBillingSummary[] = [];
    let totalActual = 0;
    let totalProjected = 0;

    // Get user's billing record for payment method (user-level billing)
    const userBilling = await prisma.userBilling.findUnique({
      where: { user_id: userId },
    });

    // Determine billing setup status
    const billingDetailsSaved = !!userBilling?.address_first_name;
    const stripeCustomerCreated = !!userBilling?.stripe_customer_id;

    const paymentMethod =
      userBilling?.payment_method_last4 && userBilling?.payment_method_brand
        ? {
            last4: userBilling.payment_method_last4,
            brand: userBilling.payment_method_brand,
          }
        : null;

    // Build billing details if saved
    const billingDetails: BillingDetails | null = userBilling
      ? {
          is_company: userBilling.is_company,
          company_name: userBilling.company_name,
          billing_email: userBilling.billing_email,
          phone: userBilling.phone,
          address_first_name: userBilling.address_first_name,
          address_last_name: userBilling.address_last_name,
          address_street: userBilling.address_street,
          address_street_number: userBilling.address_street_number,
          address_apartment_number: userBilling.address_apartment_number,
          address_city: userBilling.address_city,
          address_post_code: userBilling.address_post_code,
          address_country: userBilling.address_country,
          tin: userBilling.tin,
          vat_number: userBilling.vat_number,
        }
      : null;

    // Get billing for each organisation
    for (const orgUser of ownedOrgUsers) {
      const org = orgMap.get(orgUser.organisation_id);
      if (!org) continue;

      const billing = await getBillingSummary(orgUser.organisation_id);

      organisationBillings.push({
        organisation: {
          id: org.id,
          name: org.name,
        },
        billing: {
          active: {
            items: billing.active.line_items,
            subtotal: billing.active.subtotal,
          },
          deleted: {
            items: billing.deleted.line_items,
            subtotal: billing.deleted.subtotal,
          },
          usage: {
            items: billing.usage.line_items,
            subtotal: billing.usage.subtotal,
          },
          total: billing.total,
          projected_monthly: billing.projected_monthly,
        },
      });

      totalActual += billing.total;
      totalProjected += billing.projected_monthly;
    }

    // Sort by name
    organisationBillings.sort((a, b) => a.organisation.name.localeCompare(b.organisation.name));

    // Get trial status for the user
    const trialStatus = await getTrialStatus(userId);
    const trialInfo: TrialInfo = {
      status: trialStatus.status,
      is_active: trialStatus.trialActive,
      days_remaining: trialStatus.daysRemaining,
      end_date: trialStatus.endDate?.toISOString() || null,
      start_date: trialStatus.startDate?.toISOString() || null,
      resources_used: trialStatus.resourcesUsed,
      resources_limit: trialStatus.resourcesLimit,
      can_create_resource: trialStatus.canCreateResource,
      limits: {
        max_resources: TRIAL_CONFIG.MAX_TOTAL_RESOURCES,
        allowed_container_memory: [...TRIAL_CONFIG.ALLOWED_CONTAINER_MEMORY],
        allowed_database_tiers: [...TRIAL_CONFIG.ALLOWED_DATABASE_TIERS],
        static_site_storage_gb: TRIAL_CONFIG.STATIC_SITE_STORAGE_GB,
        static_site_bandwidth_gb: TRIAL_CONFIG.STATIC_SITE_BANDWIDTH_GB,
      },
    };

    res.json({
      data: {
        organisations: organisationBillings,
        totals: {
          actual: Math.round(totalActual * 100) / 100,
          projected: Math.round(totalProjected * 100) / 100,
        },
        period: {
          start: periodStart.toISOString(),
          end: periodEnd.toISOString(),
        },
        // Trial information
        trial: trialInfo,
        // Billing setup status - helps frontend show the right UI
        billing_details_saved: billingDetailsSaved,
        stripe_customer_created: stripeCustomerCreated,
        billing_details: billingDetails,
        payment_method: paymentMethod,
      },
    });
  } catch (error) {
    console.error('[Billing] Error getting owner billing:', error);
    res.status(500).json({
      error: 'Failed to get billing summary',
    });
  }
};
