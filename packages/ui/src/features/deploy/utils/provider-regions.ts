/**
 * Provider regions and labels for the deploy panel.
 *
 * Lifted verbatim from `deploy-panel.tsx` (rf-pdpl-1). The four exports are
 * the static lookup tables the panel uses to populate region selects and
 * provider-aware UI strings, plus a helper that picks the most-common
 * provider from a card's resource nodes.
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

export const PROVIDER_LABELS: Record<string, string> = {
  gcp: 'GCP',
  aws: 'AWS',
  azure: 'Azure',
  kubernetes: 'Kubernetes',
};

export const PROVIDER_PROJECT_LABELS: Record<string, { label: string; placeholder: string }> = {
  gcp: { label: 'GCP Project', placeholder: 'my-gcp-project' },
  aws: { label: 'AWS Account / Region', placeholder: '123456789012' },
  azure: { label: 'Azure Subscription', placeholder: 'my-subscription-id' },
  kubernetes: { label: 'Cluster Name', placeholder: 'my-k8s-cluster' },
};

/** Detect the dominant provider from canvas resource nodes */
export function detectDominantProvider(nodes: Array<{ type: string; data?: Record<string, unknown> }>): string {
  const counts: Record<string, number> = {};
  for (const n of nodes) {
    if (n.type !== 'resource') continue;
    const p = (n.data?.provider as string) || '';
    if (p) counts[p] = (counts[p] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || 'gcp';
}
