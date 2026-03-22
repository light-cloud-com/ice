/**
 * Stripe Service
 *
 * Handles all Stripe payment integration:
 * - Customer management
 * - Payment method handling
 * - Invoice creation and charging
 * - Webhook processing
 */

import Stripe from 'stripe';
import prisma from '../lib/prisma';
// Initialize Stripe (will be undefined if STRIPE_SECRET_KEY not set)
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// Types
export interface CreateCustomerData {
  organisationId: string;
  organisationName: string;
  email: string;
  billingAddress?: {
    name: string;
    line1: string;
    line2?: string;
    city: string;
    postal_code: string;
    country: string;
  };
}

export interface BillingDetailsData {
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
}

export interface PaymentMethodInfo {
  id: string;
  last4: string;
  brand: string;
  exp_month: number;
  exp_year: number;
}

export interface InvoiceLineItem {
  description: string;
  amount_cents: number; // Total amount in cents for this line item
  type?: 'user' | 'container' | 'database' | 'static_site' | 'build_minutes' | 'bandwidth' | 'storage';
}

/**
 * Check if Stripe is configured
 */
export function isStripeConfigured(): boolean {
  return stripe !== null;
}

/**
 * Create or update a Stripe customer for an organisation
 */
export async function createOrUpdateCustomer(
  data: CreateCustomerData
): Promise<string> {
  if (!stripe) {
    throw new Error(
      'Stripe is not configured. Set STRIPE_SECRET_KEY environment variable.'
    );
  }

  // Check if customer already exists
  const billing = await prisma.billing.findUnique({
    where: { organisation_id: data.organisationId },
  });

  if (billing?.stripe_customer_id) {
    // Update existing customer
    await stripe.customers.update(billing.stripe_customer_id, {
      name: data.organisationName,
      email: data.email,
      address: data.billingAddress,
      metadata: {
        organisation_id: data.organisationId,
      },
    });
    return billing.stripe_customer_id;
  }

  // Create new customer
  const customer = await stripe.customers.create({
    name: data.organisationName,
    email: data.email,
    address: data.billingAddress,
    metadata: {
      organisation_id: data.organisationId,
    },
  });

  // Save customer ID to billing
  await prisma.billing.upsert({
    where: { organisation_id: data.organisationId },
    create: {
      organisation_id: data.organisationId,
      stripe_customer_id: customer.id,
      address_first_name: data.billingAddress?.name?.split(' ')[0] || '',
      address_last_name:
        data.billingAddress?.name?.split(' ').slice(1).join(' ') || '',
      address_street: data.billingAddress?.line1 || '',
      address_street_number: '',
      address_city: data.billingAddress?.city || '',
      address_post_code: data.billingAddress?.postal_code || '',
      address_country: data.billingAddress?.country || '',
    },
    update: {
      stripe_customer_id: customer.id,
    },
  });

  return customer.id;
}

/**
 * Create a SetupIntent for adding a payment method
 */
export async function createSetupIntent(
  organisationId: string
): Promise<{ clientSecret: string }> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const billing = await prisma.billing.findUnique({
    where: { organisation_id: organisationId },
  });

  if (!billing?.stripe_customer_id) {
    throw new Error('No Stripe customer found for this organisation');
  }

  const setupIntent = await stripe.setupIntents.create({
    customer: billing.stripe_customer_id,
    payment_method_types: ['card'],
    metadata: {
      organisation_id: organisationId,
    },
  });

  return { clientSecret: setupIntent.client_secret! };
}

/**
 * Attach a payment method to a customer and set as default
 */
export async function attachPaymentMethod(
  organisationId: string,
  paymentMethodId: string
): Promise<PaymentMethodInfo> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const billing = await prisma.billing.findUnique({
    where: { organisation_id: organisationId },
  });

  if (!billing?.stripe_customer_id) {
    throw new Error('No Stripe customer found');
  }

  // Attach payment method to customer
  const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
    customer: billing.stripe_customer_id,
  });

  // Set as default payment method
  await stripe.customers.update(billing.stripe_customer_id, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  });

  // Get card details
  const card = paymentMethod.card!;

  // Update billing record
  await prisma.billing.update({
    where: { organisation_id: organisationId },
    data: {
      stripe_payment_method_id: paymentMethodId,
      payment_method_last4: card.last4,
      payment_method_brand: card.brand,
    },
  });

  return {
    id: paymentMethodId,
    last4: card.last4,
    brand: card.brand,
    exp_month: card.exp_month,
    exp_year: card.exp_year,
  };
}

/**
 * Get the current payment method for an organisation
 */
export async function getPaymentMethod(
  organisationId: string
): Promise<PaymentMethodInfo | null> {
  const billing = await prisma.billing.findUnique({
    where: { organisation_id: organisationId },
  });

  if (!billing?.stripe_payment_method_id || !stripe) {
    return null;
  }

  try {
    const paymentMethod = await stripe.paymentMethods.retrieve(
      billing.stripe_payment_method_id
    );
    const card = paymentMethod.card!;

    return {
      id: paymentMethod.id,
      last4: card.last4,
      brand: card.brand,
      exp_month: card.exp_month,
      exp_year: card.exp_year,
    };
  } catch {
    return null;
  }
}

/**
 * Remove payment method
 */
export async function removePaymentMethod(
  organisationId: string
): Promise<void> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const billing = await prisma.billing.findUnique({
    where: { organisation_id: organisationId },
  });

  if (billing?.stripe_payment_method_id) {
    await stripe.paymentMethods.detach(billing.stripe_payment_method_id);

    await prisma.billing.update({
      where: { organisation_id: organisationId },
      data: {
        stripe_payment_method_id: null,
        payment_method_last4: null,
        payment_method_brand: null,
      },
    });
  }
}

/**
 * Create a Stripe invoice from line items
 */
export async function createStripeInvoice(
  organisationId: string,
  lineItems: InvoiceLineItem[],
  options?: {
    description?: string;
    dueDate?: Date;
    autoCharge?: boolean;
  }
): Promise<{
  invoiceId: string;
  hostedInvoiceUrl: string | null;
  paid: boolean;
  status: string;
}> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const billing = await prisma.billing.findUnique({
    where: { organisation_id: organisationId },
  });

  if (!billing?.stripe_customer_id) {
    throw new Error('No Stripe customer found');
  }

  // Add invoice items - amount is the total for the line item
  for (const item of lineItems) {
    await stripe.invoiceItems.create({
      customer: billing.stripe_customer_id,
      amount: item.amount_cents,
      description: item.description,
      currency: 'usd',
      metadata: {
        item_type: item.type || 'unknown',
      },
    });
  }

  // Create invoice - charge immediately
  const invoice = await stripe.invoices.create({
    customer: billing.stripe_customer_id,
    description: options?.description,
    collection_method: 'charge_automatically', // Always charge immediately
    auto_advance: true, // Automatically finalize and attempt payment
    metadata: {
      organisation_id: organisationId,
    },
  });

  // Finalize the invoice - this triggers immediate payment attempt
  const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

  return {
    invoiceId: finalizedInvoice.id,
    hostedInvoiceUrl: finalizedInvoice.hosted_invoice_url ?? null,
    paid: finalizedInvoice.status === 'paid',
    status: finalizedInvoice.status ?? 'unknown',
  };
}

/**
 * Charge an invoice immediately
 */
export async function chargeInvoice(stripeInvoiceId: string): Promise<{
  success: boolean;
  paid: boolean;
  error?: string;
}> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  try {
    const invoice = await stripe.invoices.pay(stripeInvoiceId);
    return { success: true, paid: invoice.status === 'paid' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payment failed';
    return { success: false, paid: false, error: message };
  }
}

/**
 * Get invoice PDF URL
 */
export async function getInvoicePdfUrl(
  stripeInvoiceId: string
): Promise<string | null> {
  if (!stripe) {
    return null;
  }

  try {
    const invoice = await stripe.invoices.retrieve(stripeInvoiceId);
    return invoice.invoice_pdf ?? null;
  } catch {
    return null;
  }
}

/**
 * Handle Stripe webhook events
 */
export async function handleWebhookEvent(
  payload: Buffer,
  signature: string
): Promise<{ received: boolean; type: string }> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    throw new Error(`Webhook signature verification failed: ${err}`);
  }

  // Handle specific event types
  switch (event.type) {
    case 'invoice.paid':
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;

    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    case 'customer.subscription.deleted':
      // Handle subscription cancellation if we add subscriptions later
      break;

    case 'payment_method.attached':
      // Payment method was attached - already handled in attachPaymentMethod
      break;

    case 'payment_method.detached':
      // Payment method was removed
      break;

    default:
      console.log(`Unhandled Stripe event type: ${event.type}`);
  }

  return { received: true, type: event.type };
}

/**
 * Handle invoice.paid webhook
 */
async function handleInvoicePaid(stripeInvoice: Stripe.Invoice): Promise<void> {
  const organisationId = stripeInvoice.metadata?.organisation_id;
  if (!organisationId) return;

  // Update our invoice record
  await prisma.invoice.updateMany({
    where: { stripe_invoice_id: stripeInvoice.id },
    data: {
      status: 'paid',
      paid_at: new Date(),
      pdf_url: stripeInvoice.invoice_pdf,
    },
  });
}

/**
 * Handle invoice.payment_failed webhook
 */
async function handleInvoicePaymentFailed(
  stripeInvoice: Stripe.Invoice
): Promise<void> {
  const organisationId = stripeInvoice.metadata?.organisation_id;
  if (!organisationId) return;

  // Update our invoice record
  await prisma.invoice.updateMany({
    where: { stripe_invoice_id: stripeInvoice.id },
    data: { status: 'failed' },
  });

  // TODO: Send email notification about failed payment
}

/**
 * Get Stripe dashboard URL for an organisation's customer
 */
export async function getCustomerDashboardUrl(
  organisationId: string
): Promise<string | null> {
  const billing = await prisma.billing.findUnique({
    where: { organisation_id: organisationId },
  });

  if (!billing?.stripe_customer_id) {
    return null;
  }

  // Returns the Stripe dashboard URL (for admin use)
  return `https://dashboard.stripe.com/customers/${billing.stripe_customer_id}`;
}

/**
 * Update billing details for an organisation
 * Creates billing record if it doesn't exist
 */
export async function updateBillingDetails(
  organisationId: string,
  details: BillingDetailsData
): Promise<void> {
  // Validate company name if is_company is true
  if (details.is_company && !details.company_name) {
    throw new Error('Company name is required for business customers');
  }

  // Build the full address for Stripe
  const fullAddress = [
    details.address_street,
    details.address_street_number,
    details.address_apartment_number,
  ]
    .filter(Boolean)
    .join(' ');

  const fullName = details.is_company
    ? details.company_name
    : `${details.address_first_name} ${details.address_last_name}`;

  // Upsert billing record
  await prisma.billing.upsert({
    where: { organisation_id: organisationId },
    create: {
      organisation_id: organisationId,
      is_company: details.is_company,
      company_name: details.company_name || null,
      billing_email: details.billing_email || null,
      phone: details.phone || null,
      address_first_name: details.address_first_name,
      address_last_name: details.address_last_name,
      address_street: details.address_street,
      address_street_number: details.address_street_number,
      address_apartment_number: details.address_apartment_number || null,
      address_city: details.address_city,
      address_post_code: details.address_post_code,
      address_country: details.address_country,
      tin: details.tin || null,
      vat_number: details.vat_number || null,
    },
    update: {
      is_company: details.is_company,
      company_name: details.company_name || null,
      billing_email: details.billing_email || null,
      phone: details.phone || null,
      address_first_name: details.address_first_name,
      address_last_name: details.address_last_name,
      address_street: details.address_street,
      address_street_number: details.address_street_number,
      address_apartment_number: details.address_apartment_number || null,
      address_city: details.address_city,
      address_post_code: details.address_post_code,
      address_country: details.address_country,
      tin: details.tin || null,
      vat_number: details.vat_number || null,
    },
  });

  // Get the updated billing record
  const billing = await prisma.billing.findUnique({
    where: { organisation_id: organisationId },
  });

  // Create or update Stripe customer
  if (stripe) {
    if (billing?.stripe_customer_id) {
      // Update existing customer
      await stripe.customers.update(billing.stripe_customer_id, {
        name: fullName || undefined,
        email: details.billing_email || undefined,
        phone: details.phone || undefined,
        address: {
          line1: fullAddress,
          city: details.address_city,
          postal_code: details.address_post_code,
          country: details.address_country,
        },
      });

      // Tax IDs must be managed separately via the Tax IDs API
      if (details.vat_number) {
        const existingTaxIds = await stripe.customers.listTaxIds(
          billing.stripe_customer_id
        );
        const hasVat = existingTaxIds.data.some(
          (t) => t.type === 'eu_vat' && t.value === details.vat_number
        );
        if (!hasVat) {
          try {
            await stripe.customers.createTaxId(billing.stripe_customer_id, {
              type: 'eu_vat',
              value: details.vat_number,
            });
          } catch (error) {
            console.warn('Failed to add VAT ID:', error);
          }
        }
      }
    } else {
      // Create new Stripe customer when billing details are saved
      console.log(
        `[Stripe] Creating new customer for organisation ${organisationId}`
      );

      // Get organisation details for customer name
      const org = await prisma.organisation.findUnique({
        where: { id: organisationId },
      });

      const customer = await stripe.customers.create({
        name: fullName || org?.name || undefined,
        email: details.billing_email || undefined,
        phone: details.phone || undefined,
        address: {
          line1: fullAddress,
          city: details.address_city,
          postal_code: details.address_post_code,
          country: details.address_country,
        },
        metadata: {
          organisation_id: organisationId,
        },
      });

      // Save customer ID to billing record
      await prisma.billing.update({
        where: { organisation_id: organisationId },
        data: { stripe_customer_id: customer.id },
      });

      console.log(
        `[Stripe] Created customer ${customer.id} for organisation ${organisationId}`
      );

      // Add VAT ID if provided
      if (details.vat_number) {
        try {
          await stripe.customers.createTaxId(customer.id, {
            type: 'eu_vat',
            value: details.vat_number,
          });
        } catch (error) {
          console.warn('Failed to add VAT ID:', error);
        }
      }
    }
  }
}

/**
 * Get billing details for an organisation
 */
export async function getBillingDetails(organisationId: string) {
  const billing = await prisma.billing.findUnique({
    where: { organisation_id: organisationId },
  });

  if (!billing) {
    return null;
  }

  return {
    is_company: billing.is_company,
    company_name: billing.company_name,
    billing_email: billing.billing_email,
    phone: billing.phone,
    address_first_name: billing.address_first_name,
    address_last_name: billing.address_last_name,
    address_street: billing.address_street,
    address_street_number: billing.address_street_number,
    address_apartment_number: billing.address_apartment_number,
    address_city: billing.address_city,
    address_post_code: billing.address_post_code,
    address_country: billing.address_country,
    tin: billing.tin,
    vat_number: billing.vat_number,
  };
}

// ============================================
// USER-LEVEL BILLING FUNCTIONS
// ============================================

/**
 * Get user billing record
 */
export async function getUserBilling(userId: string) {
  return prisma.userBilling.findUnique({
    where: { user_id: userId },
  });
}

/**
 * Update user-level billing details
 * Creates billing record if it doesn't exist
 */
export async function updateUserBillingDetails(
  userId: string,
  details: BillingDetailsData
): Promise<void> {
  // Validate company name if is_company is true
  if (details.is_company && !details.company_name) {
    throw new Error('Company name is required for business customers');
  }

  // Build the full address for Stripe
  const fullAddress = [
    details.address_street,
    details.address_street_number,
    details.address_apartment_number,
  ]
    .filter(Boolean)
    .join(' ');

  const fullName = details.is_company
    ? details.company_name
    : `${details.address_first_name} ${details.address_last_name}`;

  // Upsert user billing record
  await prisma.userBilling.upsert({
    where: { user_id: userId },
    create: {
      user_id: userId,
      is_company: details.is_company,
      company_name: details.company_name || null,
      billing_email: details.billing_email || null,
      phone: details.phone || null,
      address_first_name: details.address_first_name,
      address_last_name: details.address_last_name,
      address_street: details.address_street,
      address_street_number: details.address_street_number,
      address_apartment_number: details.address_apartment_number || null,
      address_city: details.address_city,
      address_post_code: details.address_post_code,
      address_country: details.address_country,
      tin: details.tin || null,
      vat_number: details.vat_number || null,
    },
    update: {
      is_company: details.is_company,
      company_name: details.company_name || null,
      billing_email: details.billing_email || null,
      phone: details.phone || null,
      address_first_name: details.address_first_name,
      address_last_name: details.address_last_name,
      address_street: details.address_street,
      address_street_number: details.address_street_number,
      address_apartment_number: details.address_apartment_number || null,
      address_city: details.address_city,
      address_post_code: details.address_post_code,
      address_country: details.address_country,
      tin: details.tin || null,
      vat_number: details.vat_number || null,
    },
  });

  // Get the updated billing record
  const billing = await prisma.userBilling.findUnique({
    where: { user_id: userId },
  });

  // Get user details
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  // Create or update Stripe customer - REQUIRED for payment method to work
  if (!stripe) {
    throw new Error(
      'Payment processing is not configured. Please contact support.'
    );
  }

  if (billing?.stripe_customer_id) {
    // Update existing customer
    await stripe.customers.update(billing.stripe_customer_id, {
      name: fullName || undefined,
      email: details.billing_email || user?.email || undefined,
      phone: details.phone || undefined,
      address: {
        line1: fullAddress,
        city: details.address_city,
        postal_code: details.address_post_code,
        country: details.address_country,
      },
    });

    // Tax IDs must be managed separately via the Tax IDs API
    if (details.vat_number) {
      const existingTaxIds = await stripe.customers.listTaxIds(
        billing.stripe_customer_id
      );
      const hasVat = existingTaxIds.data.some(
        (t) => t.type === 'eu_vat' && t.value === details.vat_number
      );
      if (!hasVat) {
        try {
          await stripe.customers.createTaxId(billing.stripe_customer_id, {
            type: 'eu_vat',
            value: details.vat_number,
          });
        } catch (error) {
          console.warn('Failed to add VAT ID:', error);
        }
      }
    }
  } else {
    // Create new Stripe customer when billing details are saved
    console.log(`[Stripe] Creating new customer for user ${userId}`);

    const customer = await stripe.customers.create({
      name: fullName || undefined,
      email: details.billing_email || user?.email || undefined,
      phone: details.phone || undefined,
      address: {
        line1: fullAddress,
        city: details.address_city,
        postal_code: details.address_post_code,
        country: details.address_country,
      },
      metadata: {
        user_id: userId,
      },
    });

    // Save customer ID to billing record
    await prisma.userBilling.update({
      where: { user_id: userId },
      data: { stripe_customer_id: customer.id },
    });

    console.log(`[Stripe] Created customer ${customer.id} for user ${userId}`);

    // Add VAT ID if provided
    if (details.vat_number) {
      try {
        await stripe.customers.createTaxId(customer.id, {
          type: 'eu_vat',
          value: details.vat_number,
        });
      } catch (error) {
        console.warn('Failed to add VAT ID:', error);
      }
    }
  }
}

/**
 * Get user-level billing details
 */
export async function getUserBillingDetails(userId: string) {
  const billing = await prisma.userBilling.findUnique({
    where: { user_id: userId },
  });

  if (!billing) {
    return null;
  }

  return {
    is_company: billing.is_company,
    company_name: billing.company_name,
    billing_email: billing.billing_email,
    phone: billing.phone,
    address_first_name: billing.address_first_name,
    address_last_name: billing.address_last_name,
    address_street: billing.address_street,
    address_street_number: billing.address_street_number,
    address_apartment_number: billing.address_apartment_number,
    address_city: billing.address_city,
    address_post_code: billing.address_post_code,
    address_country: billing.address_country,
    tin: billing.tin,
    vat_number: billing.vat_number,
  };
}

/**
 * Create a SetupIntent for adding a payment method (user-level)
 */
export async function createUserSetupIntent(
  userId: string
): Promise<{ clientSecret: string }> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const billing = await prisma.userBilling.findUnique({
    where: { user_id: userId },
  });

  if (!billing?.stripe_customer_id) {
    throw new Error(
      'No Stripe customer found. Please save billing details first.'
    );
  }

  const setupIntent = await stripe.setupIntents.create({
    customer: billing.stripe_customer_id,
    payment_method_types: ['card'],
    metadata: {
      user_id: userId,
    },
  });

  return { clientSecret: setupIntent.client_secret! };
}

/**
 * Attach a payment method to a user and set as default
 */
export async function attachUserPaymentMethod(
  userId: string,
  paymentMethodId: string
): Promise<PaymentMethodInfo> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const billing = await prisma.userBilling.findUnique({
    where: { user_id: userId },
  });

  if (!billing?.stripe_customer_id) {
    throw new Error('No Stripe customer found');
  }

  // Attach payment method to customer
  const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
    customer: billing.stripe_customer_id,
  });

  // Set as default payment method
  await stripe.customers.update(billing.stripe_customer_id, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  });

  // Get card details
  const card = paymentMethod.card!;

  // Update billing record
  await prisma.userBilling.update({
    where: { user_id: userId },
    data: {
      stripe_payment_method_id: paymentMethodId,
      payment_method_last4: card.last4,
      payment_method_brand: card.brand,
    },
  });

  return {
    id: paymentMethodId,
    last4: card.last4,
    brand: card.brand,
    exp_month: card.exp_month,
    exp_year: card.exp_year,
  };
}

/**
 * Get the current payment method for a user
 */
export async function getUserPaymentMethod(
  userId: string
): Promise<PaymentMethodInfo | null> {
  const billing = await prisma.userBilling.findUnique({
    where: { user_id: userId },
  });

  if (!billing?.stripe_payment_method_id || !stripe) {
    return null;
  }

  try {
    const paymentMethod = await stripe.paymentMethods.retrieve(
      billing.stripe_payment_method_id
    );
    const card = paymentMethod.card!;

    return {
      id: paymentMethod.id,
      last4: card.last4,
      brand: card.brand,
      exp_month: card.exp_month,
      exp_year: card.exp_year,
    };
  } catch {
    return null;
  }
}

/**
 * Remove user payment method
 */
export async function removeUserPaymentMethod(userId: string): Promise<void> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const billing = await prisma.userBilling.findUnique({
    where: { user_id: userId },
  });

  if (billing?.stripe_payment_method_id) {
    await stripe.paymentMethods.detach(billing.stripe_payment_method_id);

    await prisma.userBilling.update({
      where: { user_id: userId },
      data: {
        stripe_payment_method_id: null,
        payment_method_last4: null,
        payment_method_brand: null,
      },
    });
  }
}

/**
 * Create a Stripe invoice for a user (using their billing details)
 */
export async function createUserStripeInvoice(
  userId: string,
  lineItems: InvoiceLineItem[],
  options?: {
    description?: string;
    dueDate?: Date;
    autoCharge?: boolean;
    invoiceNumber?: string; // Our LC-YYYY-NNNNNN invoice number
  }
): Promise<{
  invoiceId: string;
  hostedInvoiceUrl: string | null;
  paid: boolean;
  status: string;
}> {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const billing = await prisma.userBilling.findUnique({
    where: { user_id: userId },
  });

  if (!billing?.stripe_customer_id) {
    throw new Error('No Stripe customer found');
  }

  // Get user details for the invoice
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, first_name: true, last_name: true },
  });

  // Build billing address for the invoice
  const customerAddress = {
    line1: `${billing.address_street} ${billing.address_street_number}`,
    line2: billing.address_apartment_number || undefined,
    city: billing.address_city,
    postal_code: billing.address_post_code,
    country: billing.address_country,
  };

  const customerName =
    billing.is_company && billing.company_name
      ? billing.company_name
      : `${billing.address_first_name} ${billing.address_last_name}`;

  // Determine the email to use for the invoice
  const customerEmail = billing.billing_email || user?.email;

  console.log(
    `[Stripe] Creating invoice for customer ${billing.stripe_customer_id}, email: ${customerEmail}`
  );

  // Update Stripe customer with latest billing details before creating invoice
  await stripe.customers.update(billing.stripe_customer_id, {
    name: customerName,
    email: customerEmail,
    address: customerAddress,
    shipping: {
      name: customerName,
      address: customerAddress,
    },
  });

  // Create invoice as draft first with 'send_invoice' collection method
  // This allows us to send the invoice email, then pay it immediately
  // Try with our custom invoice number, fall back to Stripe-generated if taken
  let invoice;
  try {
    invoice = await stripe.invoices.create({
      customer: billing.stripe_customer_id,
      description: options?.description,
      collection_method: 'send_invoice', // Use send_invoice to enable email sending
      days_until_due: 0, // Due immediately
      auto_advance: false, // Don't auto-advance yet, we need to add items first
      number: options?.invoiceNumber, // Use our LC-YYYY-NNNNNN number
      metadata: {
        user_id: userId,
        lc_invoice_number: options?.invoiceNumber || '',
      },
    });
  } catch (createError: any) {
    // If invoice number is taken, create without custom number
    if (createError.message?.includes('Invoice number is already set')) {
      console.warn(
        `[Stripe] Invoice number ${options?.invoiceNumber} already exists, using auto-generated number`
      );
      invoice = await stripe.invoices.create({
        customer: billing.stripe_customer_id,
        description: `${options?.description} (${options?.invoiceNumber})`, // Include our number in description
        collection_method: 'send_invoice',
        days_until_due: 0,
        auto_advance: false,
        metadata: {
          user_id: userId,
          lc_invoice_number: options?.invoiceNumber || '',
        },
      });
    } else {
      throw createError;
    }
  }

  // Add invoice items to this specific invoice (must be in draft state)
  for (const item of lineItems) {
    console.log(
      `[Stripe] Adding invoice item: ${item.description}, amount: ${item.amount_cents} cents, type: ${item.type || 'unknown'}`
    );

    await stripe.invoiceItems.create({
      customer: billing.stripe_customer_id,
      invoice: invoice.id, // Attach to this specific invoice
      amount: item.amount_cents,
      description: item.description,
      currency: 'usd',
      metadata: {
        item_type: item.type || 'unknown',
      },
    });
  }

  // Finalize the invoice
  const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

  // Send the invoice email to the customer
  // sendInvoice works for 'send_invoice' collection method
  try {
    await stripe.invoices.sendInvoice(invoice.id);
    console.log(`[Stripe] Invoice email sent to customer at ${customerEmail}`);
  } catch (sendError: any) {
    // Don't fail if email send fails - invoice is still valid
    console.warn(`[Stripe] Failed to send invoice email: ${sendError.message}`);
  }

  // Now pay the invoice immediately using the customer's default payment method
  let paidInvoice = finalizedInvoice;
  if ((finalizedInvoice as any).amount_due > 0) {
    try {
      paidInvoice = await stripe.invoices.pay(invoice.id);
      console.log(
        `[Stripe] Invoice payment attempted, status: ${paidInvoice.status}`
      );
    } catch (payError: any) {
      console.error(`[Stripe] Invoice payment failed: ${payError.message}`);
      // Continue - invoice is created but payment failed
    }
  }

  // Check if payment was successful - Stripe uses status 'paid', not a .paid property
  const isPaid = paidInvoice.status === 'paid';

  console.log(
    `[Stripe] Invoice final status: ${paidInvoice.status}, isPaid: ${isPaid}`
  );

  return {
    invoiceId: paidInvoice.id,
    hostedInvoiceUrl: paidInvoice.hosted_invoice_url ?? null,
    paid: isPaid,
    status: paidInvoice.status ?? 'unknown',
  };
}
