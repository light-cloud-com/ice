/**
 * Provider Constants
 *
 * Provider identifiers, types, and display metadata.
 */

export type Provider = 'aws' | 'gcp' | 'azure' | 'kubernetes' | 'alibaba' | 'oci' | 'digitalocean';

export const ALL_PROVIDERS: Provider[] = ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean'];

export const DEFAULT_TEMPLATE_PROVIDERS: Provider[] = ['gcp', 'aws', 'azure'];

/**
 * Per-provider release readiness. Drives in-app badges and the public
 * `docs/provider-status.md` page.
 *
 * - `stable`        — full plan/apply/destroy lifecycle, importer, real-world deploys
 * - `experimental`  — major primitives work end-to-end, not at parity with stable
 * - `design-only`   — blocks render on the canvas, deployer is a stub or absent
 */
export type ProviderReadiness = 'stable' | 'experimental' | 'design-only';

export const PROVIDER_READINESS: Record<Provider, ProviderReadiness> = {
  gcp: 'stable',
  aws: 'experimental',
  azure: 'experimental',
  kubernetes: 'design-only',
  alibaba: 'design-only',
  oci: 'design-only',
  digitalocean: 'design-only',
};

export interface CloudProviderMeta {
  id: Provider;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  color: string;
  readiness: ProviderReadiness;
}

export const CLOUD_PROVIDERS: CloudProviderMeta[] = [
  {
    id: 'aws',
    name: 'Amazon Web Services',
    shortName: 'AWS',
    description: 'The most widely adopted cloud platform with 200+ services.',
    icon: 'aws',
    color: '#ff9900',
    readiness: PROVIDER_READINESS.aws,
  },
  {
    id: 'gcp',
    name: 'Google Cloud Platform',
    shortName: 'GCP',
    description: 'Google-grade infrastructure for compute, storage, and ML.',
    icon: 'gcp',
    color: '#4285f4',
    readiness: PROVIDER_READINESS.gcp,
  },
  {
    id: 'azure',
    name: 'Microsoft Azure',
    shortName: 'Azure',
    description: 'Enterprise cloud with deep Microsoft ecosystem integration.',
    icon: 'azure',
    color: '#0078d4',
    readiness: PROVIDER_READINESS.azure,
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes',
    shortName: 'K8s',
    description: 'Container orchestration — runs on any cloud or bare metal.',
    icon: 'kubernetes',
    color: '#326ce5',
    readiness: PROVIDER_READINESS.kubernetes,
  },
  {
    id: 'alibaba',
    name: 'Alibaba Cloud',
    shortName: 'Alibaba',
    description: 'Alibaba Cloud — dominant in Asia-Pacific.',
    icon: 'alibaba',
    color: '#ff6a00',
    readiness: PROVIDER_READINESS.alibaba,
  },
  {
    id: 'oci',
    name: 'Oracle Cloud',
    shortName: 'OCI',
    description: 'Oracle Cloud — enterprise workloads.',
    icon: 'oci',
    color: '#f80000',
    readiness: PROVIDER_READINESS.oci,
  },
  {
    id: 'digitalocean',
    name: 'DigitalOcean',
    shortName: 'DO',
    description: 'DigitalOcean — developer-friendly simplicity.',
    icon: 'digitalocean',
    color: '#0080ff',
    readiness: PROVIDER_READINESS.digitalocean,
  },
];
