/**
 * ============================================================================
 * LIGHT CLOUD PRICING - USAGE-BASED BILLING
 * ============================================================================
 *
 * All pricing is USAGE-BASED with HOURLY billing.
 * Formula: Customer Price = GCP Cost × (1 + margin%)
 *
 * Last Updated: January 2026
 * GCP Prices Verified: 2026-01-06 via GCP Billing Catalog API
 */

// ============================================================================
// MARGIN CONFIGURATION
// Adjust these percentages to change profit margins per service
// ============================================================================

export const MARGINS = {
  containers: 0.5, // 50% margin on containers
  databases: 0.5, // 50% margin on databases
  staticSiteStorage: 0.5, // 50% margin on static site storage
  staticSiteBandwidth: 0.4, // 40% margin on bandwidth
  databaseStorage: 0.0, // 0% margin on DB storage (pass-through)
  buildMinutes: 0.75, // 75% margin on build minutes
};

// ============================================================================
// GCP BASE RATES (verified via Billing Catalog API 2026-01-06)
// These are the actual costs we pay to GCP
// ============================================================================

export const GCP_RATES = {
  // Cloud Run Worker Pools (Tier 1 regions)
  cloudRun: {
    cpuPerVcpuHour: 0.0404784, // $0.000011244/s × 3600s
    memoryPerGibHour: 0.004446, // $0.000001235/s × 3600s
    tier2Multiplier: 1.2, // Tier 2 regions are 20% more
  },

  // Cloud SQL (Enterprise Edition, Zonal)
  cloudSql: {
    microPerHour: 0.0122, // db-f1-micro
    smallPerHour: 0.035, // db-g1-small
    vcpuPerHour: 0.0496, // Dedicated vCPU
    memoryPerGibHour: 0.007, // RAM per GiB
    ssdPerGbHour: 0.000233, // $0.17/month ÷ 730 hours
    haMultiplier: 2.0, // HA doubles the price
  },

  // Firebase Hosting
  firebaseHosting: {
    storagePerGbHour: 0.0000356, // $0.026/month ÷ 730 hours
    bandwidthPerGb: 0.15, // Per GB transferred (not hourly)
  },

  // Cloud Build
  cloudBuild: {
    minutePrice: 0.006, // e2-standard-2
  },
};

// ============================================================================
// TYPES
// ============================================================================

export interface ContainerSize {
  id: string;
  name: string;
  cpu: string;
  cpuCount: number;
  memory: string;
  memoryGiB: number;
  memoryLabel: string;
  gcpCostPerHour: number;
  pricePerHour: number;
  available: boolean;
}

export interface DatabaseTier {
  id: string;
  name: string;
  cloudSqlTier: string;
  vCPUs: number | 'Shared';
  memoryGB: number;
  memoryLabel: string;
  gcpCostPerHour: number; // Compute only (storage separate)
  pricePerHour: number;
  isSharedCore: boolean;
  isProduction: boolean;
  description: string;
}

export interface Region {
  id: string;
  name: string;
  location: string;
  tier: 'tier1' | 'tier2';
  continent: 'americas' | 'europe' | 'asia-pacific' | 'middle-east' | 'africa';
  cloudRunSupported: boolean;
  cloudSqlSupported: boolean;
}

// ============================================================================
// CONTAINER SIZES (Cloud Run) - HOURLY PRICING
// ============================================================================

function calculateContainerGcpCost(cpuCount: number, memoryGiB: number): number {
  return cpuCount * GCP_RATES.cloudRun.cpuPerVcpuHour + memoryGiB * GCP_RATES.cloudRun.memoryPerGibHour;
}

function applyMargin(gcpCost: number, margin: number): number {
  return gcpCost * (1 + margin);
}

export const CONTAINER_SIZES: ContainerSize[] = [
  {
    id: 'nano',
    name: 'Nano',
    cpu: '1',
    cpuCount: 1,
    memory: '256Mi',
    memoryGiB: 0.25,
    memoryLabel: '256 MB',
    gcpCostPerHour: calculateContainerGcpCost(1, 0.25),
    pricePerHour: applyMargin(calculateContainerGcpCost(1, 0.25), MARGINS.containers),
    available: true,
  },
  {
    id: 'micro',
    name: 'Micro',
    cpu: '1',
    cpuCount: 1,
    memory: '512Mi',
    memoryGiB: 0.5,
    memoryLabel: '512 MB',
    gcpCostPerHour: calculateContainerGcpCost(1, 0.5),
    pricePerHour: applyMargin(calculateContainerGcpCost(1, 0.5), MARGINS.containers),
    available: true,
  },
  {
    id: 'small',
    name: 'Small',
    cpu: '1',
    cpuCount: 1,
    memory: '1Gi',
    memoryGiB: 1,
    memoryLabel: '1 GB',
    gcpCostPerHour: calculateContainerGcpCost(1, 1),
    pricePerHour: applyMargin(calculateContainerGcpCost(1, 1), MARGINS.containers),
    available: true,
  },
  {
    id: 'medium',
    name: 'Medium',
    cpu: '2',
    cpuCount: 2,
    memory: '2Gi',
    memoryGiB: 2,
    memoryLabel: '2 GB',
    gcpCostPerHour: calculateContainerGcpCost(2, 2),
    pricePerHour: applyMargin(calculateContainerGcpCost(2, 2), MARGINS.containers),
    available: true,
  },
  {
    id: 'large',
    name: 'Large',
    cpu: '4',
    cpuCount: 4,
    memory: '4Gi',
    memoryGiB: 4,
    memoryLabel: '4 GB',
    gcpCostPerHour: calculateContainerGcpCost(4, 4),
    pricePerHour: applyMargin(calculateContainerGcpCost(4, 4), MARGINS.containers),
    available: true,
  },
  {
    id: 'xlarge',
    name: 'X-Large',
    cpu: '8',
    cpuCount: 8,
    memory: '8Gi',
    memoryGiB: 8,
    memoryLabel: '8 GB',
    gcpCostPerHour: calculateContainerGcpCost(8, 8),
    pricePerHour: applyMargin(calculateContainerGcpCost(8, 8), MARGINS.containers),
    available: true,
  },
  {
    id: 'xxlarge',
    name: '2X-Large',
    cpu: '8',
    cpuCount: 8,
    memory: '16Gi',
    memoryGiB: 16,
    memoryLabel: '16 GB',
    gcpCostPerHour: calculateContainerGcpCost(8, 16),
    pricePerHour: applyMargin(calculateContainerGcpCost(8, 16), MARGINS.containers),
    available: true,
  },
  {
    id: 'xxxlarge',
    name: '3X-Large',
    cpu: '8',
    cpuCount: 8,
    memory: '32Gi',
    memoryGiB: 32,
    memoryLabel: '32 GB',
    gcpCostPerHour: calculateContainerGcpCost(8, 32),
    pricePerHour: applyMargin(calculateContainerGcpCost(8, 32), MARGINS.containers),
    available: true,
  },
];

// ============================================================================
// DATABASE TIERS (Cloud SQL PostgreSQL) - HOURLY PRICING
// ============================================================================

function calculateDatabaseGcpCost(tier: string, vCPUs: number, memoryGB: number): number {
  if (tier === 'db-f1-micro') return GCP_RATES.cloudSql.microPerHour;
  if (tier === 'db-g1-small') return GCP_RATES.cloudSql.smallPerHour;
  // Dedicated instances: vCPU + memory
  return vCPUs * GCP_RATES.cloudSql.vcpuPerHour + memoryGB * GCP_RATES.cloudSql.memoryPerGibHour;
}

export const DATABASE_TIERS: DatabaseTier[] = [
  {
    id: 'dev',
    name: 'Dev',
    cloudSqlTier: 'db-f1-micro',
    vCPUs: 'Shared',
    memoryGB: 0.6,
    memoryLabel: '0.6 GB',
    gcpCostPerHour: GCP_RATES.cloudSql.microPerHour,
    pricePerHour: applyMargin(GCP_RATES.cloudSql.microPerHour, MARGINS.databases),
    isSharedCore: true,
    isProduction: false,
    description: 'Development & testing only. Not covered by SLA.',
  },
  {
    id: 'starter',
    name: 'Starter',
    cloudSqlTier: 'db-g1-small',
    vCPUs: 'Shared',
    memoryGB: 1.7,
    memoryLabel: '1.7 GB',
    gcpCostPerHour: GCP_RATES.cloudSql.smallPerHour,
    pricePerHour: applyMargin(GCP_RATES.cloudSql.smallPerHour, MARGINS.databases),
    isSharedCore: true,
    isProduction: false,
    description: 'Small projects & staging. Not covered by SLA.',
  },
  {
    id: 'pro',
    name: 'Pro',
    cloudSqlTier: 'db-custom-1-3840',
    vCPUs: 1,
    memoryGB: 3.75,
    memoryLabel: '4 GB',
    gcpCostPerHour: calculateDatabaseGcpCost('db-custom-1-3840', 1, 3.75),
    pricePerHour: applyMargin(calculateDatabaseGcpCost('db-custom-1-3840', 1, 3.75), MARGINS.databases),
    isSharedCore: false,
    isProduction: true,
    description: 'Production workloads. SLA backed.',
  },
  {
    id: 'business',
    name: 'Business',
    cloudSqlTier: 'db-custom-2-7680',
    vCPUs: 2,
    memoryGB: 7.5,
    memoryLabel: '8 GB',
    gcpCostPerHour: calculateDatabaseGcpCost('db-custom-2-7680', 2, 7.5),
    pricePerHour: applyMargin(calculateDatabaseGcpCost('db-custom-2-7680', 2, 7.5), MARGINS.databases),
    isSharedCore: false,
    isProduction: true,
    description: 'Growing applications. SLA backed.',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    cloudSqlTier: 'db-custom-4-15360',
    vCPUs: 4,
    memoryGB: 15,
    memoryLabel: '16 GB',
    gcpCostPerHour: calculateDatabaseGcpCost('db-custom-4-15360', 4, 15),
    pricePerHour: applyMargin(calculateDatabaseGcpCost('db-custom-4-15360', 4, 15), MARGINS.databases),
    isSharedCore: false,
    isProduction: true,
    description: 'High-performance workloads. SLA backed.',
  },
];

// ============================================================================
// STATIC SITE PRICING (Firebase Hosting) - USAGE-BASED
// ============================================================================

export const STATIC_SITE_RATES = {
  storage: {
    gcpCostPerGbHour: GCP_RATES.firebaseHosting.storagePerGbHour,
    pricePerGbHour: applyMargin(GCP_RATES.firebaseHosting.storagePerGbHour, MARGINS.staticSiteStorage),
    // Monthly equivalents for display
    gcpCostPerGbMonth: GCP_RATES.firebaseHosting.storagePerGbHour * 730,
    pricePerGbMonth: applyMargin(GCP_RATES.firebaseHosting.storagePerGbHour * 730, MARGINS.staticSiteStorage),
  },
  bandwidth: {
    gcpCostPerGb: GCP_RATES.firebaseHosting.bandwidthPerGb,
    pricePerGb: applyMargin(GCP_RATES.firebaseHosting.bandwidthPerGb, MARGINS.staticSiteBandwidth),
  },
};

// ============================================================================
// DATABASE STORAGE PRICING - USAGE-BASED
// ============================================================================

export const DATABASE_STORAGE_RATES = {
  gcpCostPerGbHour: GCP_RATES.cloudSql.ssdPerGbHour,
  pricePerGbHour: applyMargin(GCP_RATES.cloudSql.ssdPerGbHour, MARGINS.databaseStorage),
  // Monthly equivalents for display
  gcpCostPerGbMonth: GCP_RATES.cloudSql.ssdPerGbHour * 730,
  pricePerGbMonth: applyMargin(GCP_RATES.cloudSql.ssdPerGbHour * 730, MARGINS.databaseStorage),
};

// ============================================================================
// BUILD MINUTES PRICING
// ============================================================================

export const BUILD_RATES = {
  gcpCostPerMinute: GCP_RATES.cloudBuild.minutePrice,
  pricePerMinute: applyMargin(GCP_RATES.cloudBuild.minutePrice, MARGINS.buildMinutes),
};

// ============================================================================
// USER PRICING (flat fee, not usage-based)
// ============================================================================

export const USER_PRICING = {
  ownerFree: false, // Owner is charged
  pricePerUserMonth: 9, // $/month per user (including owner)
};

// ============================================================================
// REGIONS
// ============================================================================

export const REGIONS: Region[] = [
  // Tier 1 - Standard pricing
  {
    id: 'us-central1',
    name: 'US Central',
    location: 'Iowa',
    tier: 'tier1',
    continent: 'americas',
    cloudRunSupported: true,
    cloudSqlSupported: true,
  },
  {
    id: 'us-east1',
    name: 'US East',
    location: 'South Carolina',
    tier: 'tier1',
    continent: 'americas',
    cloudRunSupported: true,
    cloudSqlSupported: true,
  },
  {
    id: 'us-west1',
    name: 'US West',
    location: 'Oregon',
    tier: 'tier1',
    continent: 'americas',
    cloudRunSupported: true,
    cloudSqlSupported: true,
  },
  {
    id: 'europe-west1',
    name: 'Europe West',
    location: 'Belgium',
    tier: 'tier1',
    continent: 'europe',
    cloudRunSupported: true,
    cloudSqlSupported: true,
  },
  {
    id: 'europe-west4',
    name: 'Europe West',
    location: 'Netherlands',
    tier: 'tier1',
    continent: 'europe',
    cloudRunSupported: true,
    cloudSqlSupported: true,
  },
  {
    id: 'asia-east1',
    name: 'Asia East',
    location: 'Taiwan',
    tier: 'tier1',
    continent: 'asia-pacific',
    cloudRunSupported: true,
    cloudSqlSupported: true,
  },

  // Tier 2 - 20% higher pricing
  {
    id: 'europe-west2',
    name: 'Europe West',
    location: 'London',
    tier: 'tier2',
    continent: 'europe',
    cloudRunSupported: true,
    cloudSqlSupported: true,
  },
  {
    id: 'europe-west3',
    name: 'Europe West',
    location: 'Frankfurt',
    tier: 'tier2',
    continent: 'europe',
    cloudRunSupported: true,
    cloudSqlSupported: true,
  },
  {
    id: 'asia-northeast1',
    name: 'Asia Northeast',
    location: 'Tokyo',
    tier: 'tier2',
    continent: 'asia-pacific',
    cloudRunSupported: true,
    cloudSqlSupported: true,
  },
  {
    id: 'asia-southeast1',
    name: 'Asia Southeast',
    location: 'Singapore',
    tier: 'tier2',
    continent: 'asia-pacific',
    cloudRunSupported: true,
    cloudSqlSupported: true,
  },
  {
    id: 'australia-southeast1',
    name: 'Australia',
    location: 'Sydney',
    tier: 'tier2',
    continent: 'asia-pacific',
    cloudRunSupported: true,
    cloudSqlSupported: true,
  },
];

// ============================================================================
// CONSTANTS
// ============================================================================

export const HOURS_PER_MONTH = 730; // Standard billing month
export const HOURS_PER_DAY = 24;

// ============================================================================
// BILLING CALCULATION HELPERS
// ============================================================================

/** Get container size by ID */
export function getContainerSize(id: string): ContainerSize | undefined {
  return CONTAINER_SIZES.find((s) => s.id === id);
}

/** Get database tier by ID */
export function getDatabaseTier(id: string): DatabaseTier | undefined {
  return DATABASE_TIERS.find((t) => t.id === id);
}

/** Get region by ID */
export function getRegion(id: string): Region | undefined {
  return REGIONS.find((r) => r.id === id);
}

/**
 * Calculate container cost for a period
 */
export function calculateContainerCost(
  sizeId: string,
  hours: number,
  instanceCount: number = 1,
  regionId?: string,
): { gcpCost: number; price: number } {
  const size = getContainerSize(sizeId);
  if (!size) return { gcpCost: 0, price: 0 };

  let gcpCostPerHour = size.gcpCostPerHour;
  let pricePerHour = size.pricePerHour;

  // Apply tier 2 multiplier
  if (regionId) {
    const region = getRegion(regionId);
    if (region?.tier === 'tier2') {
      gcpCostPerHour *= GCP_RATES.cloudRun.tier2Multiplier;
      pricePerHour *= GCP_RATES.cloudRun.tier2Multiplier;
    }
  }

  return {
    gcpCost: gcpCostPerHour * hours * instanceCount,
    price: pricePerHour * hours * instanceCount,
  };
}

/**
 * Calculate database cost for a period
 */
export function calculateDatabaseCost(
  tierId: string,
  hours: number,
  storageGb: number,
  haEnabled: boolean = false,
): { gcpCost: number; price: number } {
  const tier = getDatabaseTier(tierId);
  if (!tier) return { gcpCost: 0, price: 0 };

  // Compute cost
  let computeGcpCost = tier.gcpCostPerHour * hours;
  let computePrice = tier.pricePerHour * hours;

  // Storage cost
  const storageGcpCost = DATABASE_STORAGE_RATES.gcpCostPerGbHour * storageGb * hours;
  const storagePrice = DATABASE_STORAGE_RATES.pricePerGbHour * storageGb * hours;

  // Total
  let gcpCost = computeGcpCost + storageGcpCost;
  let price = computePrice + storagePrice;

  // HA doubles the compute (not storage)
  if (haEnabled) {
    gcpCost = computeGcpCost * GCP_RATES.cloudSql.haMultiplier + storageGcpCost;
    price = computePrice * GCP_RATES.cloudSql.haMultiplier + storagePrice;
  }

  return { gcpCost, price };
}

/**
 * Calculate static site cost for a period
 */
export function calculateStaticSiteCost(
  storageGb: number,
  bandwidthGb: number,
  hours: number,
): { gcpCost: number; price: number } {
  const storageGcpCost = STATIC_SITE_RATES.storage.gcpCostPerGbHour * storageGb * hours;
  const storagePrice = STATIC_SITE_RATES.storage.pricePerGbHour * storageGb * hours;

  const bandwidthGcpCost = STATIC_SITE_RATES.bandwidth.gcpCostPerGb * bandwidthGb;
  const bandwidthPrice = STATIC_SITE_RATES.bandwidth.pricePerGb * bandwidthGb;

  return {
    gcpCost: storageGcpCost + bandwidthGcpCost,
    price: storagePrice + bandwidthPrice,
  };
}

/**
 * Calculate build cost
 */
export function calculateBuildCost(minutes: number): { gcpCost: number; price: number } {
  return {
    gcpCost: BUILD_RATES.gcpCostPerMinute * minutes,
    price: BUILD_RATES.pricePerMinute * minutes,
  };
}

/**
 * Calculate user cost for a month
 * All users are billed $9/month, including owner
 */
export function calculateUserCost(userCount: number): number {
  if (userCount <= 0) return 0;
  return userCount * USER_PRICING.pricePerUserMonth;
}

/**
 * Project monthly cost based on current usage
 */
export function projectMonthlyCost(currentSpend: number, hoursElapsed: number): number {
  if (hoursElapsed === 0) return 0;
  const hourlyRate = currentSpend / hoursElapsed;
  return hourlyRate * HOURS_PER_MONTH;
}

/**
 * Get hours elapsed in current billing period
 */
export function getHoursElapsedInMonth(billingStartDate: Date): number {
  const now = new Date();
  const elapsed = now.getTime() - billingStartDate.getTime();
  return Math.max(0, elapsed / (1000 * 60 * 60));
}

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

/**
 * Format price for display
 */
export function formatPrice(amount: number, decimals: number = 2): string {
  return `$${amount.toFixed(decimals)}`;
}

/**
 * Format hourly rate for display
 */
export function formatHourlyRate(ratePerHour: number): string {
  if (ratePerHour < 0.01) {
    return `$${ratePerHour.toFixed(4)}/hr`;
  }
  return `$${ratePerHour.toFixed(2)}/hr`;
}

/**
 * Format monthly estimate for display
 */
export function formatMonthlyEstimate(hourlyRate: number): string {
  const monthly = hourlyRate * HOURS_PER_MONTH;
  return `~$${monthly.toFixed(2)}/mo`;
}

/**
 * Get all pricing data for API/display
 */
export function getAllPricing() {
  return {
    margins: MARGINS,
    gcpRates: GCP_RATES,
    containers: CONTAINER_SIZES.map((c) => ({
      ...c,
      monthlyEstimate: c.pricePerHour * HOURS_PER_MONTH,
    })),
    databases: DATABASE_TIERS.map((d) => ({
      ...d,
      monthlyEstimate: d.pricePerHour * HOURS_PER_MONTH,
    })),
    staticSite: STATIC_SITE_RATES,
    databaseStorage: DATABASE_STORAGE_RATES,
    build: BUILD_RATES,
    users: USER_PRICING,
    regions: REGIONS,
    constants: {
      hoursPerMonth: HOURS_PER_MONTH,
      hoursPerDay: HOURS_PER_DAY,
    },
  };
}

// ============================================================================
// PRICE TABLE (for reference)
// ============================================================================
/*
┌─────────────────────────────────────────────────────────────────────────────┐
│ CONTAINERS (Cloud Run) - Per Instance                                       │
├──────────┬───────┬──────────┬────────────┬────────────┬─────────────────────┤
│ Size     │ vCPU  │ Memory   │ GCP/hr     │ Price/hr   │ ~Monthly (730hr)    │
├──────────┼───────┼──────────┼────────────┼────────────┼─────────────────────┤
│ nano     │ 1     │ 256 MB   │ $0.0416    │ $0.0624    │ ~$46                │
│ micro    │ 1     │ 512 MB   │ $0.0427    │ $0.0641    │ ~$47                │
│ small    │ 1     │ 1 GB     │ $0.0449    │ $0.0674    │ ~$49                │
│ medium   │ 2     │ 2 GB     │ $0.0899    │ $0.1348    │ ~$98                │
│ large    │ 4     │ 4 GB     │ $0.1797    │ $0.2696    │ ~$197               │
│ xlarge   │ 8     │ 8 GB     │ $0.3594    │ $0.5391    │ ~$394               │
│ xxlarge  │ 8     │ 16 GB    │ $0.3950    │ $0.5924    │ ~$433               │
│ xxxlarge │ 8     │ 32 GB    │ $0.4661    │ $0.6992    │ ~$510               │
└──────────┴───────┴──────────┴────────────┴────────────┴─────────────────────┘
* Tier 2 regions: +20%

┌─────────────────────────────────────────────────────────────────────────────┐
│ DATABASES (Cloud SQL) - Compute Only                                        │
├────────────┬───────┬──────────┬────────────┬────────────┬───────────────────┤
│ Tier       │ vCPU  │ RAM      │ GCP/hr     │ Price/hr   │ ~Monthly          │
├────────────┼───────┼──────────┼────────────┼────────────┼───────────────────┤
│ dev        │ Shared│ 0.6 GB   │ $0.0122    │ $0.0183    │ ~$13              │
│ starter    │ Shared│ 1.7 GB   │ $0.0350    │ $0.0525    │ ~$38              │
│ pro        │ 1     │ 4 GB     │ $0.0759    │ $0.1138    │ ~$83              │
│ business   │ 2     │ 8 GB     │ $0.1517    │ $0.2276    │ ~$166             │
│ enterprise │ 4     │ 16 GB    │ $0.3034    │ $0.4551    │ ~$332             │
└────────────┴───────┴──────────┴────────────┴────────────┴───────────────────┘
+ Storage: $0.17/GB/month ($0.000233/GB/hr)
+ HA: ×2 compute cost

┌─────────────────────────────────────────────────────────────────────────────┐
│ STATIC SITES (Firebase Hosting)                                             │
├─────────────────────┬────────────┬────────────┬─────────────────────────────┤
│ Resource            │ GCP Cost   │ Price      │ Notes                       │
├─────────────────────┼────────────┼────────────┼─────────────────────────────┤
│ Storage             │ $0.026/GB  │ $0.039/GB  │ Per month                   │
│ Bandwidth           │ $0.15/GB   │ $0.21/GB   │ Per GB transferred          │
└─────────────────────┴────────────┴────────────┴─────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ OTHER                                                                       │
├─────────────────────┬────────────┬────────────┬─────────────────────────────┤
│ Build Minutes       │ $0.006/min │ $0.011/min │ e2-standard-2               │
│ Users               │ -          │ $9/user/mo │ All users (incl. owner)     │
└─────────────────────┴────────────┴────────────┴─────────────────────────────┘
*/
