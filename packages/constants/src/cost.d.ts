/**
 * Cost Constants
 *
 * Per-tier usage estimates, traffic-tier scale factors, and provider
 * egress pricing. All values are pure data (no functions, no React).
 * Cost-calc functions live in `@ice/ui/features/cost/utils/*` and
 * import from here.
 */
/** Storage volume (GB) used to convert per-GB rates to monthly costs at each traffic tier. */
export declare const STORAGE_GB_BY_TIER: Record<string, number>;
/** Request volume (millions) used to convert per-M rates to monthly costs at each traffic tier. */
export declare const REQUESTS_M_BY_TIER: Record<string, number>;
/**
 * Fraction of (max - min) instances expected to run at each traffic tier.
 * 0 = always at min instances; 1 = always at max instances.
 */
export declare const TIER_SCALE_FACTOR: Record<string, number>;
/** Display category labels keyed by canonical category id. */
export declare const COST_CATEGORY_LABELS: Record<string, string>;
/** iceType prefix → cost-display category. Unknown prefixes map to "Other". */
export declare const ICE_PREFIX_TO_COST_CATEGORY: Record<string, string>;
export interface EgressRate {
    provider: string;
    label: string;
    freeGb: number;
    perGbRate: number;
    notes: string;
}
/** Per-provider internet-egress pricing — used by the "what would this cost on X?" comparison. */
export declare const EGRESS_RATES: Record<string, EgressRate>;
