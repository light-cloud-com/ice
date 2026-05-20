/**
 * Region Constants
 *
 * Per-provider region lists. Two shapes:
 *   - `PROVIDER_REGIONS`: bare region codes, used by deploy-panel selectors
 *     where the label is the code itself.
 *   - `PROVIDER_REGION_LABELS`: region code → human label, used by the
 *     onboarding flow where the user picks a friendly "US East
 *     (N. Virginia)" instead of `us-east-1`.
 *
 * The two are kept in sync deliberately: every code in
 * `PROVIDER_REGIONS` should have a matching label in
 * `PROVIDER_REGION_LABELS`.
 */

/**
 * Keyed by provider id (string) rather than `Provider` so consumers that
 * pass a free-form string (e.g., the deploy panel's local `provider`
 * state) can index without a cast. Only `gcp`/`aws`/`azure` are
 * populated today; missing keys return undefined and the caller falls
 * back to a default.
 */
export const PROVIDER_REGIONS: Record<string, string[]> = {
  gcp: [
    'us-central1',
    'us-east1',
    'us-east4',
    'us-west1',
    'us-west2',
    'europe-west1',
    'europe-west2',
    'europe-west3',
    'europe-west4',
    'asia-east1',
    'asia-southeast1',
    'asia-northeast1',
    'australia-southeast1',
  ],
  aws: [
    'us-east-1',
    'us-east-2',
    'us-west-1',
    'us-west-2',
    'eu-west-1',
    'eu-west-2',
    'eu-central-1',
    'ap-southeast-1',
    'ap-northeast-1',
    'ap-south-1',
  ],
  azure: [
    'eastus',
    'eastus2',
    'westus',
    'westus2',
    'centralus',
    'northeurope',
    'westeurope',
    'uksouth',
    'southeastasia',
    'eastasia',
    'australiaeast',
  ],
};

export const PROVIDER_REGION_LABELS: Record<string, Record<string, string>> = {
  gcp: {
    'us-central1': 'US Central (Iowa)',
    'us-east1': 'US East (S. Carolina)',
    'us-west1': 'US West (Oregon)',
    'europe-west1': 'Europe West (Belgium)',
    'europe-west3': 'Europe West (Frankfurt)',
    'asia-east1': 'Asia East (Taiwan)',
    'asia-northeast1': 'Asia NE (Tokyo)',
    'australia-southeast1': 'Australia (Sydney)',
  },
  aws: {
    'us-east-1': 'US East (N. Virginia)',
    'us-west-2': 'US West (Oregon)',
    'eu-west-1': 'Europe (Ireland)',
    'eu-central-1': 'Europe (Frankfurt)',
    'ap-southeast-1': 'Asia Pacific (Singapore)',
    'ap-northeast-1': 'Asia Pacific (Tokyo)',
    'ap-south-1': 'Asia Pacific (Mumbai)',
  },
  azure: {
    eastus: 'East US',
    westus2: 'West US 2',
    westeurope: 'West Europe',
    northeurope: 'North Europe',
    southeastasia: 'Southeast Asia',
    eastasia: 'East Asia',
    australiaeast: 'Australia East',
  },
};

/**
 * Default-region fallback ordering used by the onboarding region
 * suggester (picks best region by user timezone). Entry order matters.
 */
export const REGION_SUGGESTION_ORDER: Record<string, string[]> = {
  gcp: ['us-west1', 'us-central1', 'europe-west1', 'europe-west3', 'asia-east1'],
  aws: ['us-west-2', 'us-east-1', 'eu-west-1', 'eu-central-1', 'ap-southeast-1'],
  azure: ['westus2', 'eastus', 'westeurope', 'northeurope', 'southeastasia'],
};
