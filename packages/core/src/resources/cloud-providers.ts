/**
 * Cloud Provider Registry
 *
 * Canonical display metadata for cloud providers.
 * Provider IDs align with the schemas `providers` table.
 * Branding data (name, color, shortName) is curated here
 * since the schemas DB doesn't store display metadata.
 */

// =============================================================================
// Types
// =============================================================================

export interface CloudProviderMeta {
  /** Provider key — 'aws', 'gcp', 'azure', 'kubernetes', etc. */
  id: string;
  /** Full name — 'Amazon Web Services' */
  name: string;
  /** Short label for pills/badges — 'AWS' */
  shortName: string;
  /** One-liner description */
  description: string;
  /** Icon registry key */
  icon: string;
  /** Brand hex color */
  color: string;
}

// =============================================================================
// Registry
// =============================================================================

export const CLOUD_PROVIDERS: CloudProviderMeta[] = [
  {
    id: 'aws',
    name: 'Amazon Web Services',
    shortName: 'AWS',
    description: 'The most widely adopted cloud platform with 200+ services.',
    icon: 'aws',
    color: '#ff9900',
  },
  {
    id: 'gcp',
    name: 'Google Cloud Platform',
    shortName: 'GCP',
    description: 'Google-grade infrastructure for compute, storage, and ML.',
    icon: 'gcp',
    color: '#4285f4',
  },
  {
    id: 'azure',
    name: 'Microsoft Azure',
    shortName: 'Azure',
    description: 'Enterprise cloud with deep Microsoft ecosystem integration.',
    icon: 'azure',
    color: '#0078d4',
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes',
    shortName: 'K8s',
    description: 'Container orchestration — runs on any cloud or bare metal.',
    icon: 'kubernetes',
    color: '#326ce5',
  },
  {
    id: 'alibaba',
    name: 'Alibaba Cloud',
    shortName: 'Alibaba',
    description: 'Alibaba Cloud — dominant in Asia-Pacific.',
    icon: 'alibaba',
    color: '#ff6a00',
  },
  {
    id: 'oci',
    name: 'Oracle Cloud',
    shortName: 'OCI',
    description: 'Oracle Cloud — enterprise workloads.',
    icon: 'oci',
    color: '#f80000',
  },
  {
    id: 'digitalocean',
    name: 'DigitalOcean',
    shortName: 'DO',
    description: 'DigitalOcean — developer-friendly simplicity.',
    icon: 'digitalocean',
    color: '#0080ff',
  },
];

// =============================================================================
// Lookup helpers
// =============================================================================

const providerMap = new Map<string, CloudProviderMeta>(CLOUD_PROVIDERS.map((p) => [p.id, p]));

/** Get full metadata for a provider by ID. */
export function getCloudProvider(id: string): CloudProviderMeta | undefined {
  return providerMap.get(id);
}

/** Get all registered cloud providers. */
export function getAllCloudProviders(): CloudProviderMeta[] {
  return CLOUD_PROVIDERS;
}

/** Get brand color for a provider (falls back to gray). */
export function getCloudProviderColor(id: string): string {
  return providerMap.get(id)?.color ?? '#6b7280';
}

/** Get short display name for a provider (falls back to uppercased id). */
export function getCloudProviderShortName(id: string): string {
  return providerMap.get(id)?.shortName ?? id.toUpperCase();
}
