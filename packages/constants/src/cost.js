/**
 * Cost Constants
 *
 * Per-tier usage estimates, traffic-tier scale factors, and provider
 * egress pricing. All values are pure data (no functions, no React).
 * Cost-calc functions live in `@ice/ui/features/cost/utils/*` and
 * import from here.
 */
/** Storage volume (GB) used to convert per-GB rates to monthly costs at each traffic tier. */
export const STORAGE_GB_BY_TIER = {
    dev: 1,
    low: 10,
    moderate: 50,
    medium: 200,
    high: 1000,
    'very-high': 10000,
};
/** Request volume (millions) used to convert per-M rates to monthly costs at each traffic tier. */
export const REQUESTS_M_BY_TIER = {
    dev: 0.01,
    low: 0.1,
    moderate: 1,
    medium: 10,
    high: 100,
    'very-high': 1000,
};
/**
 * Fraction of (max - min) instances expected to run at each traffic tier.
 * 0 = always at min instances; 1 = always at max instances.
 */
export const TIER_SCALE_FACTOR = {
    dev: 0,
    low: 0.1,
    moderate: 0.25,
    medium: 0.5,
    high: 0.75,
    'very-high': 1,
};
/** Display category labels keyed by canonical category id. */
export const COST_CATEGORY_LABELS = {
    Compute: 'Compute',
    Data: 'Data Storage',
    Messaging: 'Messaging',
    Networking: 'Networking',
    Security: 'Security',
    Observability: 'Observability',
    Analytics: 'Analytics',
    'AI / ML': 'AI / ML',
    Config: 'Config',
    Source: 'Source',
    Other: 'Other',
};
/** iceType prefix → cost-display category. Unknown prefixes map to "Other". */
export const ICE_PREFIX_TO_COST_CATEGORY = {
    Compute: 'Compute',
    Database: 'Data',
    Storage: 'Data',
    Messaging: 'Messaging',
    Network: 'Networking',
    Security: 'Security',
    Monitoring: 'Observability',
    Analytics: 'Analytics',
    AI: 'AI / ML',
    Config: 'Config',
    Source: 'Source',
};
/** Per-provider internet-egress pricing — used by the "what would this cost on X?" comparison. */
export const EGRESS_RATES = {
    aws: {
        provider: 'aws',
        label: 'AWS',
        freeGb: 1,
        perGbRate: 0.09,
        notes: 'First 10 TB/mo at $0.09/GB, then $0.085',
    },
    gcp: {
        provider: 'gcp',
        label: 'GCP',
        freeGb: 1,
        perGbRate: 0.12,
        notes: 'Standard tier ~$0.085/GB, Premium tier ~$0.12/GB',
    },
    azure: {
        provider: 'azure',
        label: 'Azure',
        freeGb: 5,
        perGbRate: 0.087,
        notes: 'First 5 GB free, then $0.087/GB for first 10 TB',
    },
    digitalocean: {
        provider: 'digitalocean',
        label: 'DigitalOcean',
        freeGb: 1000,
        perGbRate: 0.01,
        notes: '1 TB free transfer included, then $0.01/GB',
    },
    alibaba: {
        provider: 'alibaba',
        label: 'Alibaba Cloud',
        freeGb: 0,
        perGbRate: 0.08,
        notes: '~$0.08/GB for international traffic',
    },
    oci: {
        provider: 'oci',
        label: 'Oracle Cloud',
        freeGb: 10240,
        perGbRate: 0.0085,
        notes: '10 TB/mo free, then $0.0085/GB — best egress pricing',
    },
};
