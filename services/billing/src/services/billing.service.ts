/**
 * Billing Service
 *
 * Core billing logic for calculating charges, managing credits,
 * and generating billing summaries.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import {
  CONTAINER_SIZES,
  DATABASE_TIERS,
  getContainerSize,
  getDatabaseTier,
  getRegion,
  calculateContainerCost,
  calculateDatabaseCost,
  calculateStaticSiteCost,
  calculateBuildCost,
  calculateUserCost,
  USER_PRICING,
  BUILD_RATES,
  STATIC_SITE_RATES,
  HOURS_PER_MONTH,
  GCP_RATES,
} from '../const/light-cloud-pricing';
import {
  calculateBillableHours,
  hasScalingData,
} from './scalingTrackingService';

// Types
export interface BillingLineItem {
  type:
    | 'user'
    | 'container'
    | 'database'
    | 'static_site'
    | 'build_minutes'
    | 'bandwidth'
    | 'storage';
  name?: string;
  quantity: number;
  unit_price: number;
  total: number;
  details?: Record<string, unknown>;
  status?: 'active' | 'deleted';
  hours_used?: number;
}

export interface BillingBreakdown {
  period: {
    start: Date;
    end: Date;
  };
  active: {
    line_items: BillingLineItem[];
    subtotal: number;
  };
  deleted: {
    line_items: BillingLineItem[];
    subtotal: number;
  };
  usage: {
    line_items: BillingLineItem[];
    subtotal: number;
  };
  subtotal: number;
  total: number;
  projected_monthly: number;
  // Trial information
  is_trial?: boolean;
  trial_days_remaining?: number;
}

export interface ResourceCostEstimate {
  monthly_cost: number;
  prorated_cost: number;
  days_remaining: number;
  included: string[];
  add_ons_available: Array<{ name: string; price: number }>;
}

/**
 * Calculate current billing charges for an organisation
 * Separates active resources, deleted resources, and usage-based charges
 *
 * Active resources are billed hourly based on actual usage this month.
 * Users are billed monthly (prorated if added mid-month).
 *
 * @param organisationId - The organisation to calculate charges for
 * @param options - Optional period override for historical billing (e.g., invoice generation)
 */
export async function calculateCurrentCharges(
  organisationId: string,
  options?: {
    periodStart?: Date;
    periodEnd?: Date;
    asOfDate?: Date; // The "now" date for calculations (defaults to current time)
  }
): Promise<BillingBreakdown> {
  const now = options?.asOfDate || new Date();
  const periodStart =
    options?.periodStart || new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd =
    options?.periodEnd || new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const MIN_BILLING_HOURS = 1;

  // Check if organisation owner is on active trial
  let isOnTrial = false;
  let trialDaysRemaining: number | undefined;

  const ownerRecord = await prisma.organisationUsers.findFirst({
    where: { organisation_id: organisationId, role: 'owner', status: 1 },
  });

  if (ownerRecord?.user_id) {
    const userBilling = await prisma.userBilling.findUnique({
      where: { user_id: ownerRecord.user_id },
    });

    // Check if owner is on active trial - we'll still calculate charges but mark as trial
    if (
      userBilling?.trial_status === 'active' &&
      userBilling.trial_end_date &&
      now < userBilling.trial_end_date
    ) {
      isOnTrial = true;
      trialDaysRemaining = Math.ceil(
        (userBilling.trial_end_date.getTime() - now.getTime()) /
          (1000 * 60 * 60 * 24)
      );
    }
  }

  const activeItems: BillingLineItem[] = [];
  const deletedItems: BillingLineItem[] = [];
  const usageItems: BillingLineItem[] = [];

  // Helper to calculate hours active this month
  const calculateHoursThisMonth = (createdAt: Date): number => {
    const effectiveStart = createdAt > periodStart ? createdAt : periodStart;
    const hoursActive =
      (now.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60);
    return Math.max(hoursActive, MIN_BILLING_HOURS);
  };

  // ==================== ACTIVE RESOURCES ====================

  // 1. Active users (billed monthly - all users including owner)
  const userCount = await prisma.organisationUsers.count({
    where: { organisation_id: organisationId, status: 1 },
  });

  if (userCount > 0) {
    const userTotal = calculateUserCost(userCount);
    activeItems.push({
      type: 'user',
      name: `Team members (${userCount} users)`,
      quantity: userCount,
      unit_price: USER_PRICING.pricePerUserMonth,
      total: userTotal,
      status: 'active',
      details: { monthly_rate: userTotal },
    });
  }

  // 2. Active containers and static sites (billed hourly)
  const environments = await prisma.environment.findMany({
    where: {
      application: { organisation_id: organisationId },
      status: { in: ['deployed', 'deploying'] },
    },
    include: { application: true },
  });

  for (const env of environments) {
    if (env.application.deployment_type === 'container') {
      const memory = env.memory || env.application.memory || '512Mi';
      const region = env.cloud_run_region || env.application.cloud_run_region;

      // Map memory to container size ID
      const memoryToSizeMap: Record<string, string> = {
        '256Mi': 'nano', '512Mi': 'micro', '1Gi': 'small', '2Gi': 'medium',
        '4Gi': 'large', '8Gi': 'xlarge', '16Gi': 'xxlarge', '32Gi': 'xxxlarge',
      };
      const sizeId = memoryToSizeMap[memory] || 'micro';
      const containerSize = getContainerSize(sizeId);
      const hourlyRate = containerSize?.pricePerHour || 0.0641; // Default to micro

      // Check if we have scaling data for this environment
      // If yes, use scale-aware billing (only charge when running)
      // If no, fallback to legacy billing (charge from created_at)
      let hoursUsed: number;
      let scaleAwareBilling = false;
      let scaledToZeroHours = 0;

      // Track instance scaling info for billing display
      let billingMinInstances = 0;
      let billingMaxInstances = 1;
      let billingAvgInstances = 1;

      const hasScaling = await hasScalingData(env.id);
      if (hasScaling) {
        const scalingData = await calculateBillableHours(
          env.id,
          periodStart,
          now
        );
        hoursUsed = Math.max(scalingData.totalHours, MIN_BILLING_HOURS);
        scaleAwareBilling = true;
        billingMinInstances = scalingData.minInstances;
        billingMaxInstances = scalingData.maxInstances;
        billingAvgInstances = scalingData.avgInstances;

        // Calculate hours saved (scaled to zero)
        const totalPossibleHours = calculateHoursThisMonth(env.created_at);
        scaledToZeroHours = Math.max(
          0,
          Math.ceil(totalPossibleHours) - hoursUsed
        );
      } else {
        // Fallback: legacy billing from created_at
        const hoursUsedRaw = calculateHoursThisMonth(env.created_at);
        hoursUsed = Math.ceil(hoursUsedRaw);
      }

      // Calculate cost using hourly rate
      let adjustedHourlyRate = hourlyRate;
      if (region) {
        const regionData = getRegion(region);
        if (regionData?.tier === 'tier2') {
          adjustedHourlyRate *= GCP_RATES.cloudRun.tier2Multiplier;
        }
      }
      const actualCharge = adjustedHourlyRate * hoursUsed;

      // Calculate monthly projection based on actual usage pattern, not worst-case 730h
      // For scale-to-zero containers, extrapolate from actual usage this period
      const hoursInPeriod = (now.getTime() - periodStart.getTime()) / (1000 * 60 * 60);
      let monthlyEstimate: number;
      let isScaleToZero = false;

      // Check if this is a scale-to-zero container (nano tier or min_instances = 0)
      const minInstances = env.min_instances ?? env.application.min_instances ?? 0;
      if (minInstances === 0 || sizeId === 'nano') {
        isScaleToZero = true;
        // Project based on actual usage ratio
        if (hoursInPeriod > 0) {
          const usageRatio = hoursUsed / hoursInPeriod;
          const projectedHours = usageRatio * HOURS_PER_MONTH;
          monthlyEstimate = adjustedHourlyRate * projectedHours;
        } else {
          // No data yet, show minimal estimate
          monthlyEstimate = adjustedHourlyRate * hoursUsed;
        }
      } else {
        // Always-on container: assume 730h/month
        monthlyEstimate = adjustedHourlyRate * HOURS_PER_MONTH;
      }

      activeItems.push({
        type: 'container',
        name: `${env.application.name} / ${env.name}`,
        quantity: 1,
        unit_price: adjustedHourlyRate,
        total: Math.round(actualCharge * 100) / 100,
        status: 'active',
        hours_used: hoursUsed,
        details: {
          size: sizeId,
          memory,
          region,
          hourly_rate: adjustedHourlyRate,
          monthly_rate: Math.round(monthlyEstimate * 100) / 100,
          scale_to_zero: isScaleToZero,
          max_monthly_rate: isScaleToZero
            ? Math.round(adjustedHourlyRate * HOURS_PER_MONTH * 100) / 100
            : undefined,
          scale_aware_billing: scaleAwareBilling,
          scaled_to_zero_hours: scaleAwareBilling
            ? scaledToZeroHours
            : undefined,
          // Instance scaling info for per-instance billing
          min_instances: scaleAwareBilling ? billingMinInstances : undefined,
          max_instances: scaleAwareBilling ? billingMaxInstances : undefined,
          avg_instances: scaleAwareBilling ? billingAvgInstances : undefined,
        },
      });
    } else if (env.application.deployment_type === 'static') {
      // Static sites are billed purely on usage (storage + bandwidth)
      // For now, we estimate based on a default storage of 0.5GB until we track actual usage
      const hoursUsedRaw = calculateHoursThisMonth(env.created_at);
      const hoursUsed = Math.ceil(hoursUsedRaw);

      // Estimate storage at 0.5GB (will be replaced with actual tracking)
      const estimatedStorageGb = 0.5;
      const storageCost = STATIC_SITE_RATES.storage.pricePerGbHour * estimatedStorageGb * hoursUsed;

      // Bandwidth is tracked separately in usageRecords
      // Here we only charge for storage hours
      const actualCharge = storageCost;
      const hourlyRate = STATIC_SITE_RATES.storage.pricePerGbHour * estimatedStorageGb;
      const monthlyEstimate = hourlyRate * HOURS_PER_MONTH;

      activeItems.push({
        type: 'static_site',
        name: `${env.application.name} / ${env.name}`,
        quantity: 1,
        unit_price: hourlyRate,
        total: Math.round(actualCharge * 10000) / 10000, // More precision for small amounts
        status: 'active',
        hours_used: hoursUsed,
        details: {
          storage_gb: estimatedStorageGb,
          hourly_rate: hourlyRate,
          monthly_rate: Math.round(monthlyEstimate * 100) / 100,
        },
      });
    }
  }

  // 3. Active databases (billed hourly)
  const databases = await prisma.database.findMany({
    where: {
      organisation_id: organisationId,
      status: { in: ['ready', 'provisioning'] },
    },
  });

  // Map Cloud SQL tier names to our pricing tier IDs
  const cloudSqlTierMap: Record<string, string> = {
    'db-f1-micro': 'dev',
    'db-g1-small': 'starter',
    'db-custom-1-3840': 'pro',
    'db-custom-2-7680': 'business',
    'db-custom-4-15360': 'enterprise',
  };

  for (const db of databases) {
    const tierId = cloudSqlTierMap[db.tier] || 'dev';
    const dbTier = getDatabaseTier(tierId);
    const hoursUsedRaw = calculateHoursThisMonth(db.created_at);
    const hoursUsed = Math.ceil(hoursUsedRaw); // Round up to whole hours

    // Get hourly rate (with HA multiplier if enabled)
    let hourlyRate = dbTier?.pricePerHour || 0.0183; // Default to dev tier
    if (db.ha_enabled) {
      hourlyRate *= GCP_RATES.cloudSql.haMultiplier;
    }

    const actualCharge = hourlyRate * hoursUsed;
    const monthlyEstimate = hourlyRate * HOURS_PER_MONTH;

    activeItems.push({
      type: 'database',
      name: db.name,
      quantity: 1,
      unit_price: hourlyRate,
      total: Math.round(actualCharge * 100) / 100,
      status: 'active',
      hours_used: hoursUsed,
      details: {
        tier: tierId,
        cloudSqlTier: db.tier,
        ha_enabled: db.ha_enabled,
        hourly_rate: hourlyRate,
        monthly_rate: Math.round(monthlyEstimate * 100) / 100,
      },
    });
  }

  // ==================== DELETED RESOURCES (this billing period) ====================

  // Get all pricing events for this billing period
  const pricingEvents = await prisma.resourcePricingEvent.findMany({
    where: {
      organisation_id: organisationId,
      occurred_at: { gte: periodStart, lte: now },
    },
    orderBy: { occurred_at: 'asc' },
  });

  // Group events by resource_id
  const resourceEvents: Map<string, typeof pricingEvents> = new Map();
  for (const event of pricingEvents) {
    const existing = resourceEvents.get(event.resource_id) || [];
    existing.push(event);
    resourceEvents.set(event.resource_id, existing);
  }

  // Find resources that were created AND deleted in this period
  for (const [resourceId, events] of resourceEvents) {
    let createEvent: (typeof pricingEvents)[0] | null = null;
    let deleteEvent: (typeof pricingEvents)[0] | null = null;

    for (const event of events) {
      if (event.event_type === 'created') {
        createEvent = event;
      } else if (event.event_type === 'deleted') {
        deleteEvent = event;
      }
    }

    // Only include if it was deleted (otherwise it's still active)
    if (deleteEvent) {
      // Users are charged flat monthly rate, infrastructure is charged hourly
      if (deleteEvent.resource_type === 'user') {
        // Flat rate for users - full monthly charge regardless of duration
        const userPrice = Number(deleteEvent.unit_price) || USER_PRICING.pricePerUserMonth;
        deletedItems.push({
          type: 'user',
          name: deleteEvent.resource_name,
          quantity: 1,
          unit_price: userPrice,
          total: userPrice,
          status: 'deleted',
          details: { monthly_rate: userPrice },
        });
      } else if (createEvent) {
        // Hourly billing for infrastructure - requires create event for duration
        const hoursUsedRaw =
          (deleteEvent.occurred_at.getTime() -
            createEvent.occurred_at.getTime()) /
          (1000 * 60 * 60);
        const hoursUsed = Math.max(Math.ceil(hoursUsedRaw), MIN_BILLING_HOURS); // Round up, min 1h

        // Backwards compatibility: old events stored monthly price, new events store hourly rate
        // Detect old format by price ranges:
        // - Containers: old ~$31-47/mo, new ~$0.06/hr → if > $1, it's monthly
        // - Databases: old ~$13-332/mo, new ~$0.02-0.45/hr → if > $1, it's monthly
        // - Static sites: old ~$0.026/mo, new ~$0.00003/hr → if > $0.001, it's monthly
        const storedPrice = Number(createEvent.unit_price);
        let hourlyRate: number;

        if (createEvent.resource_type === 'static_site') {
          // Static sites: if > $0.001, it's the old monthly format
          hourlyRate = storedPrice > 0.001 ? storedPrice / HOURS_PER_MONTH : storedPrice;
        } else {
          // Containers/Databases: if > $1, it's the old monthly format
          hourlyRate = storedPrice > 1 ? storedPrice / HOURS_PER_MONTH : storedPrice;
        }
        const charge = hourlyRate * hoursUsed;

        deletedItems.push({
          type: createEvent.resource_type as BillingLineItem['type'],
          name: createEvent.resource_name,
          quantity: 1,
          unit_price: Number(createEvent.unit_price),
          total: Math.round(charge * 100) / 100,
          status: 'deleted',
          hours_used: hoursUsed,
          details: {
            size_tier: createEvent.size_tier,
            monthly_rate: Number(createEvent.unit_price),
          },
        });
      }
    }
  }

  // ==================== USAGE-BASED CHARGES ====================

  const usageRecords = await prisma.usageRecord.findMany({
    where: {
      organisation_id: organisationId,
      date: { gte: periodStart, lte: now },
    },
  });

  // Build minutes
  const totalBuildMinutes = usageRecords.reduce(
    (sum, r) => sum + r.build_minutes,
    0
  );
  if (totalBuildMinutes > 0) {
    usageItems.push({
      type: 'build_minutes',
      name: 'Build minutes',
      quantity: totalBuildMinutes,
      unit_price: BUILD_RATES.pricePerMinute,
      total: Math.round(totalBuildMinutes * BUILD_RATES.pricePerMinute * 100) / 100,
    });
  }

  // Bandwidth (all bandwidth is now usage-based, no "included" amount)
  const totalBandwidthBytes = usageRecords.reduce(
    (sum, r) => sum + BigInt(r.bandwidth_bytes),
    BigInt(0)
  );
  const totalBandwidthGB = Number(totalBandwidthBytes) / (1024 * 1024 * 1024);

  if (totalBandwidthGB > 0) {
    usageItems.push({
      type: 'bandwidth',
      name: `Bandwidth (${totalBandwidthGB.toFixed(2)} GB)`,
      quantity: Math.ceil(totalBandwidthGB * 100) / 100,
      unit_price: STATIC_SITE_RATES.bandwidth.pricePerGb,
      total: Math.round(totalBandwidthGB * STATIC_SITE_RATES.bandwidth.pricePerGb * 100) / 100,
    });
  }

  // ==================== CALCULATE TOTALS ====================

  const activeSubtotal = activeItems.reduce((sum, item) => sum + item.total, 0);
  const deletedSubtotal = deletedItems.reduce(
    (sum, item) => sum + item.total,
    0
  );
  const usageSubtotal = usageItems.reduce((sum, item) => sum + item.total, 0);
  const total = activeSubtotal + deletedSubtotal + usageSubtotal;

  // Projected monthly = active projected rates + deleted charges (already billed) + usage
  // Deleted resources ARE included because they've already been charged and will appear on invoice
  const activeMonthlyRate = activeItems.reduce((sum, item) => {
    // Use monthly_rate from details if available, otherwise use unit_price
    const monthlyRate =
      (item.details?.monthly_rate as number) || item.unit_price;
    return sum + monthlyRate;
  }, 0);
  const projectedMonthly = activeMonthlyRate + deletedSubtotal + usageSubtotal;

  return {
    period: { start: periodStart, end: periodEnd },
    active: {
      line_items: activeItems,
      subtotal: Math.round(activeSubtotal * 100) / 100,
    },
    deleted: {
      line_items: deletedItems,
      subtotal: Math.round(deletedSubtotal * 100) / 100,
    },
    usage: {
      line_items: usageItems,
      subtotal: Math.round(usageSubtotal * 100) / 100,
    },
    subtotal: Math.round(total * 100) / 100,
    total: Math.round(total * 100) / 100,
    projected_monthly: Math.round(projectedMonthly * 100) / 100,
    // Trial information - charges are calculated but not billed during trial
    is_trial: isOnTrial,
    trial_days_remaining: trialDaysRemaining,
  };
}

/**
 * Estimate cost for a new resource before creation
 * All costs are now hourly-based
 */
export async function estimateResourceCost(
  resourceType: 'container' | 'database' | 'static_site',
  options: {
    size?: string;
    tier?: string;
    region?: string;
    ha_enabled?: boolean;
    storageGb?: number;
  }
): Promise<ResourceCostEstimate> {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysRemaining = endOfMonth.getDate() - now.getDate() + 1;
  const hoursRemaining = daysRemaining * 24;

  let hourlyRate = 0;
  const included: string[] = [];
  const addOnsAvailable: Array<{ name: string; price: number }> = [];

  // Map memory to container size ID
  const memoryToSizeMap: Record<string, string> = {
    '256Mi': 'nano', '512Mi': 'micro', '1Gi': 'small', '2Gi': 'medium',
    '4Gi': 'large', '8Gi': 'xlarge', '16Gi': 'xxlarge', '32Gi': 'xxxlarge',
  };

  // Map Cloud SQL tier to our tier ID
  const cloudSqlTierMap: Record<string, string> = {
    'db-f1-micro': 'dev', 'db-g1-small': 'starter',
    'db-custom-1-3840': 'pro', 'db-custom-2-7680': 'business',
    'db-custom-4-15360': 'enterprise',
  };

  switch (resourceType) {
    case 'container':
      const sizeId = memoryToSizeMap[options.size || '512Mi'] || 'micro';
      const containerSize = getContainerSize(sizeId);
      hourlyRate = containerSize?.pricePerHour || 0.0641;

      // Apply tier 2 multiplier if applicable
      if (options.region) {
        const region = getRegion(options.region);
        if (region?.tier === 'tier2') {
          hourlyRate *= GCP_RATES.cloudRun.tier2Multiplier;
        }
      }

      included.push('Custom domain', 'Scale-to-zero', 'Auto-scaling');
      addOnsAvailable.push(
        { name: 'Always-on (min 1 instance)', price: 0 }, // Now part of usage
        { name: 'Tier 2 region', price: Math.round(hourlyRate * HOURS_PER_MONTH * 0.2) }
      );
      break;

    case 'database':
      const tierId = cloudSqlTierMap[options.tier || 'db-f1-micro'] || 'dev';
      const dbTier = getDatabaseTier(tierId);
      hourlyRate = dbTier?.pricePerHour || 0.0183;

      if (options.ha_enabled) {
        hourlyRate *= GCP_RATES.cloudSql.haMultiplier;
      }

      included.push('Daily backups', 'SSL encryption', 'Monitoring');
      if (!options.ha_enabled) {
        addOnsAvailable.push({ name: 'High Availability', price: Math.round(hourlyRate * HOURS_PER_MONTH) });
      }
      break;

    case 'static_site':
      // Static sites are purely usage-based (storage + bandwidth)
      // Estimate based on 0.5GB storage
      const estimatedStorageGb = options.storageGb || 0.5;
      hourlyRate = STATIC_SITE_RATES.storage.pricePerGbHour * estimatedStorageGb;
      included.push('Global CDN', 'SSL certificate', 'Preview environments');
      break;
  }

  const monthlyCost = hourlyRate * HOURS_PER_MONTH;
  const proratedCost = hourlyRate * hoursRemaining;

  return {
    monthly_cost: Math.round(monthlyCost * 100) / 100,
    prorated_cost: Math.round(proratedCost * 100) / 100,
    days_remaining: daysRemaining,
    included,
    add_ons_available: addOnsAvailable,
  };
}

/**
 * Record a resource pricing event (create, upgrade, delete)
 * unit_price is now the hourly rate for infrastructure, or monthly rate for users
 */
export async function recordPricingEvent(
  organisationId: string,
  resourceType: 'container' | 'database' | 'static_site' | 'user',
  resourceId: string,
  resourceName: string,
  eventType: 'created' | 'upgraded' | 'downgraded' | 'deleted',
  sizeTier?: string,
  region?: string,
  unitPrice?: number
): Promise<void> {
  // Calculate unit price if not provided (hourly rate for infra, monthly for users)
  let price = unitPrice;

  // Map memory to container size ID
  const memoryToSizeMap: Record<string, string> = {
    '256Mi': 'nano', '512Mi': 'micro', '1Gi': 'small', '2Gi': 'medium',
    '4Gi': 'large', '8Gi': 'xlarge', '16Gi': 'xxlarge', '32Gi': 'xxxlarge',
  };

  // Map Cloud SQL tier to our tier ID
  const cloudSqlTierMap: Record<string, string> = {
    'db-f1-micro': 'dev', 'db-g1-small': 'starter',
    'db-custom-1-3840': 'pro', 'db-custom-2-7680': 'business',
    'db-custom-4-15360': 'enterprise',
  };

  if (price === undefined) {
    switch (resourceType) {
      case 'container':
        const sizeId = memoryToSizeMap[sizeTier || '512Mi'] || 'micro';
        const containerSize = getContainerSize(sizeId);
        price = containerSize?.pricePerHour || 0.0641;
        // Apply tier 2 multiplier if applicable
        if (region) {
          const regionData = getRegion(region);
          if (regionData?.tier === 'tier2') {
            price *= GCP_RATES.cloudRun.tier2Multiplier;
          }
        }
        break;
      case 'database':
        const tierId = cloudSqlTierMap[sizeTier || 'db-f1-micro'] || 'dev';
        const dbTier = getDatabaseTier(tierId);
        price = dbTier?.pricePerHour || 0.0183;
        break;
      case 'static_site':
        // Estimate based on 0.5GB storage
        price = STATIC_SITE_RATES.storage.pricePerGbHour * 0.5;
        break;
      case 'user':
        price = USER_PRICING.pricePerUserMonth;
        break;
    }
  }

  await prisma.resourcePricingEvent.create({
    data: {
      organisation_id: organisationId,
      resource_type: resourceType,
      resource_id: resourceId,
      resource_name: resourceName,
      event_type: eventType,
      size_tier: sizeTier,
      region,
      unit_price: price,
    },
  });
}

/**
 * Check if a new charge would exceed spending limit
 */
export async function checkSpendingLimit(
  organisationId: string,
  additionalCharge: number
): Promise<{
  allowed: boolean;
  limit: number | null;
  current: number;
  projected: number;
}> {
  const billing = await prisma.billing.findUnique({
    where: { organisation_id: organisationId },
  });

  if (!billing?.spending_limit) {
    return {
      allowed: true,
      limit: null,
      current: 0,
      projected: additionalCharge,
    };
  }

  const currentCharges = await calculateCurrentCharges(organisationId);
  const limit = Number(billing.spending_limit);
  const current = currentCharges.total;
  const projected = current + additionalCharge;

  return {
    allowed: projected <= limit,
    limit,
    current,
    projected,
  };
}

/**
 * Update spending limit and/or budget alert threshold
 */
export async function updateBillingSettings(
  organisationId: string,
  settings: {
    spending_limit?: number | null;
    budget_alert_threshold?: number | null;
  }
): Promise<void> {
  await prisma.billing.update({
    where: { organisation_id: organisationId },
    data: {
      spending_limit: settings.spending_limit,
      budget_alert_threshold: settings.budget_alert_threshold,
    },
  });
}

/**
 * Get billing summary for display
 */
export async function getBillingSummary(organisationId: string) {
  const billing = await prisma.billing.findUnique({
    where: { organisation_id: organisationId },
  });

  const charges = await calculateCurrentCharges(organisationId);

  return {
    ...charges,
    payment_method: billing?.stripe_payment_method_id
      ? {
          last4: billing.payment_method_last4,
          brand: billing.payment_method_brand,
        }
      : null,
    settings: {
      spending_limit: billing?.spending_limit
        ? Number(billing.spending_limit)
        : null,
      budget_alert_threshold: billing?.budget_alert_threshold
        ? Number(billing.budget_alert_threshold)
        : null,
    },
  };
}

/**
 * Calculate charges for deleted/short-lived resources using ResourcePricingEvent
 * Minimum billing: 1 hour
 * Note: unit_price is now the hourly rate directly
 */
export async function calculateHistoricalCharges(
  organisationId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<BillingLineItem[]> {
  const lineItems: BillingLineItem[] = [];
  const MIN_BILLING_HOURS = 1;

  // Get all pricing events for this period
  const events = await prisma.resourcePricingEvent.findMany({
    where: {
      organisation_id: organisationId,
      occurred_at: { gte: periodStart, lte: periodEnd },
    },
    orderBy: { occurred_at: 'asc' },
  });

  // Group events by resource_id
  const resourceEvents: Map<string, typeof events> = new Map();
  for (const event of events) {
    const existing = resourceEvents.get(event.resource_id) || [];
    existing.push(event);
    resourceEvents.set(event.resource_id, existing);
  }

  // Calculate charges for each resource
  for (const [resourceId, resourceEventList] of resourceEvents) {
    let totalHours = 0;
    let lastCreateEvent: (typeof events)[0] | null = null;
    let resourceName = '';
    let resourceType = '';
    let hourlyRate = 0;

    for (const event of resourceEventList) {
      resourceName = event.resource_name;
      resourceType = event.resource_type;
      hourlyRate = Number(event.unit_price); // unit_price is now the hourly rate

      if (event.event_type === 'created' || event.event_type === 'upgraded') {
        lastCreateEvent = event;
      } else if (event.event_type === 'deleted' && lastCreateEvent) {
        // Calculate hours between create and delete
        const createTime = lastCreateEvent.occurred_at.getTime();
        const deleteTime = event.occurred_at.getTime();
        const hours = (deleteTime - createTime) / (1000 * 60 * 60);
        totalHours += Math.max(hours, MIN_BILLING_HOURS);
        lastCreateEvent = null;
      }
    }

    // If resource was created but not deleted (still active), don't double-count
    // as it will be counted in calculateCurrentCharges

    // Only add line item if there were completed lifecycle events (created then deleted)
    if (totalHours > 0) {
      // Backwards compatibility: old events stored monthly price, new events store hourly rate
      // Static sites: if > $0.001, it's monthly. Others: if > $1, it's monthly.
      let actualHourlyRate: number;
      if (resourceType === 'static_site') {
        actualHourlyRate = hourlyRate > 0.001 ? hourlyRate / HOURS_PER_MONTH : hourlyRate;
      } else {
        actualHourlyRate = hourlyRate > 1 ? hourlyRate / HOURS_PER_MONTH : hourlyRate;
      }
      const charge = actualHourlyRate * totalHours;

      lineItems.push({
        type: resourceType as BillingLineItem['type'],
        name: `${resourceName} (deleted - ${Math.round(totalHours)}h)`,
        quantity: Math.round(totalHours),
        unit_price: Math.round(actualHourlyRate * 10000) / 10000, // per hour
        total: Math.round(charge * 100) / 100,
        details: {
          resource_id: resourceId,
          hours_used: totalHours,
          min_billing_hours: MIN_BILLING_HOURS,
        },
      });
    }
  }

  return lineItems;
}

/**
 * Get daily usage data for chart display
 *
 * Note: Users are billed monthly (not hourly) as they are team members, not infrastructure.
 * Infrastructure (containers, databases, static sites) is billed hourly with 1h minimum.
 */
export async function getDailyUsageHistory(
  organisationId: string,
  days: number = 30
): Promise<
  Array<{ date: string; cost: number; breakdown: Record<string, number> }>
> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const result: Array<{
    date: string;
    cost: number;
    breakdown: Record<string, number>;
  }> = [];

  // Get all pricing events in the period
  const events = await prisma.resourcePricingEvent.findMany({
    where: {
      organisation_id: organisationId,
      occurred_at: { gte: startDate, lte: endDate },
    },
    orderBy: { occurred_at: 'asc' },
  });

  // Note: Users are billed monthly (not hourly like infrastructure)
  // We don't include users in daily breakdown since it's confusing
  // Users should only appear in the billing summary, not the usage chart

  // Get current active resources
  const environments = await prisma.environment.findMany({
    where: {
      application: { organisation_id: organisationId },
      status: { in: ['deployed', 'deploying'] },
    },
    include: { application: true },
  });

  const databases = await prisma.database.findMany({
    where: {
      organisation_id: organisationId,
      status: { in: ['ready', 'provisioning'] },
    },
  });

  // Build a map of active resources by date
  const activeResources: Map<string, Set<string>> = new Map();
  const resourcePrices: Map<string, { type: string; price: number }> =
    new Map();

  // Track resource lifecycle from events
  const resourceActiveRanges: Map<
    string,
    Array<{ start: Date; end: Date | null; type: string; price: number }>
  > = new Map();

  for (const event of events) {
    const ranges = resourceActiveRanges.get(event.resource_id) || [];

    if (event.event_type === 'created') {
      // Backwards compatibility: old events stored monthly price, new events store hourly rate
      // Static sites: if > $0.001, it's monthly. Others: if > $1, it's monthly.
      const storedPrice = Number(event.unit_price);
      let hourlyRate: number;
      if (event.resource_type === 'static_site') {
        hourlyRate = storedPrice > 0.001 ? storedPrice / HOURS_PER_MONTH : storedPrice;
      } else {
        hourlyRate = storedPrice > 1 ? storedPrice / HOURS_PER_MONTH : storedPrice;
      }

      ranges.push({
        start: event.occurred_at,
        end: null,
        type: event.resource_type,
        price: hourlyRate,
      });
    } else if (event.event_type === 'deleted' && ranges.length > 0) {
      const lastRange = ranges[ranges.length - 1];
      if (!lastRange.end) {
        lastRange.end = event.occurred_at;
      }
    }

    resourceActiveRanges.set(event.resource_id, ranges);
  }

  // Map memory to container size ID
  const memoryToSizeMap: Record<string, string> = {
    '256Mi': 'nano', '512Mi': 'micro', '1Gi': 'small', '2Gi': 'medium',
    '4Gi': 'large', '8Gi': 'xlarge', '16Gi': 'xxlarge', '32Gi': 'xxxlarge',
  };

  // Map Cloud SQL tier to our tier ID
  const cloudSqlTierMap: Record<string, string> = {
    'db-f1-micro': 'dev', 'db-g1-small': 'starter',
    'db-custom-1-3840': 'pro', 'db-custom-2-7680': 'business',
    'db-custom-4-15360': 'enterprise',
  };

  // Add currently active resources (no delete event)
  for (const env of environments) {
    if (!resourceActiveRanges.has(env.id)) {
      let hourlyRate: number;
      if (env.application.deployment_type === 'container') {
        const sizeId = memoryToSizeMap[env.memory || env.application.memory || '512Mi'] || 'micro';
        const containerSize = getContainerSize(sizeId);
        hourlyRate = containerSize?.pricePerHour || 0.0641;
        // Apply tier 2 multiplier if applicable
        const region = env.cloud_run_region || env.application.cloud_run_region;
        if (region) {
          const regionData = getRegion(region);
          if (regionData?.tier === 'tier2') {
            hourlyRate *= GCP_RATES.cloudRun.tier2Multiplier;
          }
        }
      } else {
        // Static site: usage-based on storage (estimate 0.5GB)
        hourlyRate = STATIC_SITE_RATES.storage.pricePerGbHour * 0.5;
      }

      resourceActiveRanges.set(env.id, [
        {
          start: env.created_at,
          end: null,
          type:
            env.application.deployment_type === 'container'
              ? 'container'
              : 'static_site',
          price: hourlyRate, // Now storing hourly rate
        },
      ]);
    }
  }

  for (const db of databases) {
    if (!resourceActiveRanges.has(db.id)) {
      const tierId = cloudSqlTierMap[db.tier] || 'dev';
      const dbTier = getDatabaseTier(tierId);
      let hourlyRate = dbTier?.pricePerHour || 0.0183;
      if (db.ha_enabled) {
        hourlyRate *= GCP_RATES.cloudSql.haMultiplier;
      }

      resourceActiveRanges.set(db.id, [
        {
          start: db.created_at,
          end: null,
          type: 'database',
          price: hourlyRate, // Now storing hourly rate
        },
      ]);
    }
  }

  // Calculate daily costs (infrastructure only - users are monthly flat rate)
  // price is now the hourly rate, so daily = hourly × 24
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dayStart = new Date(d);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d);
    dayEnd.setHours(23, 59, 59, 999);

    const breakdown: Record<string, number> = {
      container: 0,
      static_site: 0,
      database: 0,
    };

    for (const [resourceId, ranges] of resourceActiveRanges) {
      for (const range of ranges) {
        // Check if resource was active during this day
        const rangeEnd = range.end || endDate;
        if (range.start <= dayEnd && rangeEnd >= dayStart) {
          // Resource was active on this day
          // price is hourly rate, so daily cost = hourly × 24
          const dailyRate = range.price * 24;
          breakdown[range.type] = (breakdown[range.type] || 0) + dailyRate;
        }
      }
    }

    const totalCost = Object.values(breakdown).reduce(
      (sum, val) => sum + val,
      0
    );

    result.push({
      date: dayStart.toISOString().split('T')[0],
      cost: Math.round(totalCost * 100) / 100,
      breakdown: {
        container: Math.round(breakdown.container * 100) / 100,
        static_site: Math.round(breakdown.static_site * 100) / 100,
        database: Math.round(breakdown.database * 100) / 100,
      },
    });
  }

  return result;
}
