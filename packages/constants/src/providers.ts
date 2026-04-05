/**
 * Provider Constants
 *
 * Provider identifiers, types, and display metadata.
 */

export type Provider = 'aws' | 'gcp' | 'azure' | 'kubernetes' | 'alibaba' | 'oci' | 'digitalocean';

export const ALL_PROVIDERS: Provider[] = ['aws', 'gcp', 'azure', 'kubernetes', 'alibaba', 'oci', 'digitalocean'];

export const DEFAULT_TEMPLATE_PROVIDERS: Provider[] = ['gcp', 'aws', 'azure'];

export interface CloudProviderMeta {
  id: Provider;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  color: string;
}

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
