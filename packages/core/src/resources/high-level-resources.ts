/**
 * High-Level Resource Definitions
 *
 * User-friendly abstractions over low-level cloud resources.
 * Users work with these concepts, and ICE maps them to actual cloud resources.
 *
 * Module layout (rf-hlres split — in progress):
 *   - `./high-level-resources/types.ts`              — interfaces + NodeBehavior re-export (rf-hlres-1)
 *   - `./high-level-resources/categories/<name>.ts`  — per-category data (rf-hlres-2..7, size exception)
 *   - `./high-level-resources/helpers.ts`            — palette/provider/asset helpers (rf-hlres-8)
 *   - this file                                      — public re-export shim that assembles
 *                                                      `HIGH_LEVEL_CATEGORIES` (rf-hlres-9)
 */

import { type NodeBehavior, BEHAVIOR_LABELS, BEHAVIOR_COLORS } from '@ice/constants';
import type {
  HighLevelCategory,
  HighLevelProperty,
  HighLevelResource,
} from './high-level-resources/types.js';
import { compute } from './high-level-resources/categories/compute.js';
import { database } from './high-level-resources/categories/database.js';

export type { NodeBehavior };
export type {
  HighLevelCategory,
  HighLevelProperty,
  HighLevelResource,
  OptionDetail,
  ProviderImplementation,
} from './high-level-resources/types.js';

/**
 * High-level resource categories that make sense to developers
 */
export const HIGH_LEVEL_CATEGORIES: HighLevelCategory[] = [
  compute,
  database,
  {
    id: 'storage',
    name: 'Storage',
    description: 'File and object storage',
    icon: 'HardDrive',
    resources: [
      {
        id: 'object-storage',
        name: 'Object Storage',
        description: 'Store files, images, videos, and backups',
        icon: 'Archive',
        category: 'storage',
        behavior: 'stateful' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure', 'alibaba', 'oci', 'digitalocean'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:s3:Bucket', display_name: 'S3 Bucket' },
          {
            provider: 'gcp',
            resource_type: 'gcp:storage:Bucket',
            display_name: 'Cloud Storage Bucket',
          },
          {
            provider: 'azure',
            resource_type: 'azure:storage:Container',
            display_name: 'Azure Blob Container',
          },
          { provider: 'alibaba', resource_type: 'alibaba:oss:Bucket', display_name: 'OSS Bucket' },
          {
            provider: 'oci',
            resource_type: 'oci:objectstorage:Bucket',
            display_name: 'OCI Object Storage',
          },
          {
            provider: 'digitalocean',
            resource_type: 'digitalocean:spaces:Bucket',
            display_name: 'Spaces Bucket',
          },
        ],
        keywords: ['s3', 'bucket', 'blob', 'storage', 'gcs', 'object'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this storage bucket',
            placeholder: 'My Files',
          },
          {
            name: 'public',
            label: 'Publicly accessible?',
            type: 'boolean',
            required: false,
            tier: 'essential',
            description: 'Allow anyone on the internet to view these files',
            default: false,
          },
          {
            name: 'storage_class',
            label: 'Storage class',
            type: 'select',
            required: true,
            tier: 'essential',
            description: 'Access frequency — affects cost and retrieval speed',
            default: 'standard',
            optionDetails: [
              {
                value: 'standard',
                label: 'Standard',
                description: 'Frequently accessed data',
                cost: '~$0.023/GB/mo',
                provider: 'aws',
              },
              {
                value: 'standard-ia',
                label: 'Infrequent Access',
                description: 'Accessed < 1x/month · lower storage cost',
                cost: '~$0.0125/GB/mo',
                provider: 'aws',
              },
              {
                value: 'glacier',
                label: 'Glacier',
                description: 'Archive · minutes-to-hours retrieval',
                cost: '~$0.004/GB/mo',
                provider: 'aws',
              },
              {
                value: 'glacier-deep',
                label: 'Glacier Deep Archive',
                description: 'Long-term archive · 12-hour retrieval',
                cost: '~$0.00099/GB/mo',
                provider: 'aws',
              },
              {
                value: 'gcp-standard',
                label: 'Standard',
                description: 'Frequently accessed data',
                cost: '~$0.020/GB/mo',
                provider: 'gcp',
              },
              {
                value: 'gcp-nearline',
                label: 'Nearline',
                description: 'Accessed < 1x/month',
                cost: '~$0.010/GB/mo',
                provider: 'gcp',
              },
              {
                value: 'gcp-coldline',
                label: 'Coldline',
                description: 'Accessed < 1x/quarter',
                cost: '~$0.004/GB/mo',
                provider: 'gcp',
              },
              {
                value: 'gcp-archive',
                label: 'Archive',
                description: 'Accessed < 1x/year',
                cost: '~$0.0012/GB/mo',
                provider: 'gcp',
              },
              {
                value: 'azure-hot',
                label: 'Hot',
                description: 'Frequently accessed data',
                cost: '~$0.018/GB/mo',
                provider: 'azure',
              },
              {
                value: 'azure-cool',
                label: 'Cool',
                description: 'Infrequently accessed · 30-day min',
                cost: '~$0.010/GB/mo',
                provider: 'azure',
              },
              {
                value: 'azure-archive',
                label: 'Archive',
                description: 'Rarely accessed · hours to retrieve',
                cost: '~$0.002/GB/mo',
                provider: 'azure',
              },
            ],
          },
          {
            name: 'versioning',
            label: 'Keep old versions of files?',
            type: 'boolean',
            required: false,
            tier: 'detailed',
            description: 'Keep old versions of files — enables recovery from accidental deletes',
            default: false,
          },
        ],
      },
      {
        id: 'oss',
        name: 'OSS',
        description: 'Alibaba Cloud object storage with China-optimized CDN',
        icon: 'HardDrive',
        category: 'storage',
        behavior: 'stateful' as NodeBehavior,
        providers: ['alibaba'],
        implementations: [{ provider: 'alibaba', resource_type: 'alibaba:oss:Bucket', display_name: 'OSS Bucket' }],
        keywords: ['oss', 'object', 'storage', 'alibaba', 'bucket'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this storage bucket',
            placeholder: 'My Files',
          },
          {
            name: 'storage_class',
            label: 'Storage class',
            type: 'select',
            required: true,
            tier: 'essential',
            description: 'Access frequency — affects cost and retrieval speed',
            default: 'oss-standard',
            optionDetails: [
              {
                value: 'oss-standard',
                label: 'Standard',
                description: 'Frequently accessed data',
                cost: '~$0.02/GB/mo',
                provider: 'alibaba',
              },
              {
                value: 'oss-ia',
                label: 'Infrequent Access',
                description: 'Accessed < 1x/month · 30-day min',
                cost: '~$0.008/GB/mo',
                provider: 'alibaba',
              },
              {
                value: 'oss-archive',
                label: 'Archive',
                description: 'Rarely accessed · 1-minute restore',
                cost: '~$0.005/GB/mo',
                provider: 'alibaba',
              },
              {
                value: 'oss-cold-archive',
                label: 'Cold Archive',
                description: 'Long-term archive · hours to restore',
                cost: '~$0.002/GB/mo',
                provider: 'alibaba',
              },
            ],
          },
          {
            name: 'public',
            label: 'Publicly accessible?',
            type: 'boolean',
            required: false,
            tier: 'essential',
            description: 'Allow anyone on the internet to view these files',
            default: false,
          },
        ],
      },
      {
        id: 'oci-object-storage',
        name: 'OCI Object Storage',
        description: 'Enterprise object storage with automatic tiering',
        icon: 'HardDrive',
        category: 'storage',
        behavior: 'stateful' as NodeBehavior,
        providers: ['oci'],
        implementations: [
          {
            provider: 'oci',
            resource_type: 'oci:objectstorage:Bucket',
            display_name: 'OCI Object Storage Bucket',
          },
        ],
        keywords: ['oci', 'object', 'storage', 'oracle', 'bucket'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this storage bucket',
            placeholder: 'My Files',
          },
          {
            name: 'storage_class',
            label: 'Storage tier',
            type: 'select',
            required: true,
            tier: 'essential',
            description: 'Access frequency — affects cost and retrieval speed',
            default: 'oci-standard',
            optionDetails: [
              {
                value: 'oci-standard',
                label: 'Standard',
                description: 'Frequently accessed · hot data',
                cost: '~$0.0255/GB/mo',
                provider: 'oci',
              },
              {
                value: 'oci-infrequent',
                label: 'Infrequent Access',
                description: 'Accessed < 1x/month',
                cost: '~$0.01/GB/mo',
                provider: 'oci',
              },
              {
                value: 'oci-archive',
                label: 'Archive',
                description: 'Rarely accessed · 1-hour restore',
                cost: '~$0.004/GB/mo',
                provider: 'oci',
              },
            ],
          },
          {
            name: 'public',
            label: 'Publicly accessible?',
            type: 'boolean',
            required: false,
            tier: 'essential',
            description: 'Allow anyone on the internet to view these files',
            default: false,
          },
          {
            name: 'auto_tiering',
            label: 'Auto-tiering?',
            type: 'boolean',
            required: false,
            tier: 'detailed',
            description: 'Automatically move objects to cheaper tiers based on access patterns',
            default: false,
          },
        ],
      },
      {
        id: 'do-spaces',
        name: 'Spaces',
        description: 'S3-compatible object storage with built-in CDN',
        icon: 'HardDrive',
        category: 'storage',
        behavior: 'stateful' as NodeBehavior,
        providers: ['digitalocean'],
        implementations: [
          {
            provider: 'digitalocean',
            resource_type: 'digitalocean:spaces:Bucket',
            display_name: 'Spaces Bucket',
          },
        ],
        keywords: ['spaces', 'object', 'storage', 'digitalocean', 's3'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this storage space',
            placeholder: 'My Files',
          },
          {
            name: 'location',
            label: 'Region',
            type: 'select',
            required: false,
            tier: 'essential',
            description: 'Pick the region closest to your users',
            default: 'nyc3',
            optionDetails: [
              { value: 'nyc3', label: 'New York (NYC3)', description: 'US East', provider: 'digitalocean' },
              { value: 'sfo3', label: 'San Francisco (SFO3)', description: 'US West', provider: 'digitalocean' },
              { value: 'ams3', label: 'Amsterdam (AMS3)', description: 'Europe', provider: 'digitalocean' },
              { value: 'sgp1', label: 'Singapore (SGP1)', description: 'Asia Pacific', provider: 'digitalocean' },
              { value: 'fra1', label: 'Frankfurt (FRA1)', description: 'Europe', provider: 'digitalocean' },
              { value: 'syd1', label: 'Sydney (SYD1)', description: 'Australia', provider: 'digitalocean' },
            ],
          },
        ],
      },
      {
        id: 'file-storage',
        name: 'File Storage',
        description: 'Network file system for shared access',
        icon: 'Folder',
        category: 'storage',
        behavior: 'stateful' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:efs:FileSystem', display_name: 'EFS File System' },
          { provider: 'gcp', resource_type: 'gcp:filestore:Instance', display_name: 'Filestore' },
          {
            provider: 'azure',
            resource_type: 'azure:storage:FileShare',
            display_name: 'Azure Files',
          },
        ],
        keywords: ['efs', 'nfs', 'file', 'filestore', 'shared'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this shared drive',
            placeholder: 'Shared Files',
          },
          {
            name: 'size',
            label: 'Throughput mode',
            type: 'select',
            required: true,
            tier: 'essential',
            description: 'Performance tier — determines throughput and IOPS',
            default: 'efs-bursting',
            optionDetails: [
              {
                value: 'efs-bursting',
                label: 'EFS Bursting',
                description: 'Standard throughput · scales with size',
                cost: '~$0.30/GB/mo',
                provider: 'aws',
              },
              {
                value: 'efs-elastic',
                label: 'EFS Elastic',
                description: 'Auto-scaling throughput · pay per use',
                cost: '~$0.04/GB read',
                provider: 'aws',
              },
              {
                value: 'efs-provisioned',
                label: 'EFS Provisioned',
                description: 'Guaranteed throughput · predictable perf',
                cost: '~$6/MB/s/mo',
                provider: 'aws',
              },
              {
                value: 'gcp-basic-hdd',
                label: 'Basic HDD',
                description: '1 TB min · cost-effective',
                cost: '~$0.20/GB/mo',
                provider: 'gcp',
              },
              {
                value: 'gcp-basic-ssd',
                label: 'Basic SSD',
                description: '2.5 TB min · low-latency',
                cost: '~$0.55/GB/mo',
                provider: 'gcp',
              },
              {
                value: 'gcp-enterprise',
                label: 'Enterprise',
                description: 'Regional HA · high throughput',
                cost: '~$0.35/GB/mo',
                provider: 'gcp',
              },
              {
                value: 'azure-standard',
                label: 'Standard (GPv2)',
                description: 'HDD-backed · cost-effective',
                cost: '~$0.06/GB/mo',
                provider: 'azure',
              },
              {
                value: 'azure-premium',
                label: 'Premium',
                description: 'SSD-backed · low-latency',
                cost: '~$0.16/GB/mo',
                provider: 'azure',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'networking',
    name: 'Networking',
    description: 'Load balancers, CDN, DNS, and VPC',
    icon: 'Network',
    resources: [
      {
        id: 'public-endpoint',
        name: 'Public Endpoint',
        description:
          'Public HTTPS entry point with managed SSL certificate. Connect to one or more services and route traffic by subdomain (api.example.com, app.example.com, …).',
        icon: 'Globe',
        category: 'networking',
        behavior: 'connector' as NodeBehavior,
        providers: ['gcp', 'aws', 'azure'],
        implementations: [
          {
            provider: 'gcp',
            resource_type: 'gcp:compute:GlobalForwardingRule',
            display_name: 'Global Load Balancer',
          },
          {
            provider: 'aws',
            resource_type: 'aws:elasticloadbalancingv2:LoadBalancer',
            display_name: 'Application Load Balancer',
          },
          {
            provider: 'azure',
            resource_type: 'azure:network:FrontDoor',
            display_name: 'Front Door',
          },
        ],
        keywords: ['domain', 'https', 'ssl', 'certificate', 'public', 'internet', 'load balancer', 'subdomain'],
        properties: [
          {
            name: 'domain',
            label: 'Domain',
            type: 'string',
            required: false,
            tier: 'essential',
            description:
              'Root domain you own (e.g. example.com). Leave empty for IP-only HTTP deploys without a certificate.',
            placeholder: 'example.com',
          },
          {
            name: 'enableHttps',
            label: 'Enable HTTPS',
            type: 'boolean',
            required: false,
            tier: 'essential',
            description: 'Serve traffic over HTTPS with a managed SSL certificate. Turn off for plain HTTP on the IP.',
            default: true,
          },
          {
            name: 'autoProvisionCert',
            label: 'Auto-provision SSL certificate',
            type: 'boolean',
            required: false,
            tier: 'essential',
            description:
              'Let the cloud provider automatically issue and renew a managed certificate for your domain(s). Uncheck to bring your own.',
            default: true,
          },
          {
            name: 'sslCertificateId',
            label: 'Existing certificate ID',
            type: 'string',
            required: false,
            tier: 'advanced',
            description:
              'Use an existing SSL certificate instead of auto-provisioning one. Only used when auto-provision is off.',
            placeholder: 'projects/.../sslCertificates/...',
          },
          {
            name: 'redirectHttpToHttps',
            label: 'Redirect HTTP → HTTPS',
            type: 'boolean',
            required: false,
            tier: 'essential',
            description: 'Automatically redirect visitors from http:// to https://.',
            default: true,
          },
        ],
      },
      {
        id: 'vpc-network',
        name: 'Virtual Network',
        description: 'Isolated network that contains subnets and resources',
        icon: 'Network',
        category: 'networking',
        behavior: 'container' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:ec2:Vpc', display_name: 'VPC' },
          { provider: 'gcp', resource_type: 'gcp:compute:Network', display_name: 'VPC Network' },
          {
            provider: 'azure',
            resource_type: 'azure:network:VirtualNetwork',
            display_name: 'Virtual Network',
          },
        ],
        keywords: ['vpc', 'vnet', 'network', 'virtual', 'subnet'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this network',
            placeholder: 'My Network',
          },
          {
            name: 'size',
            label: 'Size',
            type: 'select',
            required: true,
            tier: 'essential',
            description: 'How many services will live in this network?',
            options: ['Small — a few services', 'Medium — a typical app', 'Large — many services and teams'],
            default: 'Small — a few services',
          },
          {
            name: 'cidr',
            label: 'IP range',
            type: 'string',
            required: false,
            tier: 'advanced',
            description: 'Advanced: custom IP address range for this network',
            default: '10.0.0.0/16',
            placeholder: 'e.g. 10.0.0.0/16',
          },
        ],
      },
      {
        id: 'subnet',
        name: 'Subnet',
        description: 'Network subdivision within a VPC',
        icon: 'Layers',
        category: 'networking',
        behavior: 'container' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:ec2:Subnet', display_name: 'Subnet' },
          { provider: 'gcp', resource_type: 'gcp:compute:Subnetwork', display_name: 'Subnetwork' },
          { provider: 'azure', resource_type: 'azure:network:Subnet', display_name: 'Subnet' },
        ],
        keywords: ['subnet', 'subnetwork', 'az', 'availability'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this subnet',
            placeholder: 'My Subnet',
          },
          {
            name: 'internet_access',
            label: 'Can reach the internet?',
            type: 'boolean',
            required: false,
            tier: 'detailed',
            description: 'Allow resources in this subnet to access the internet',
            default: false,
          },
          {
            name: 'cidr',
            label: 'IP range',
            type: 'string',
            required: false,
            tier: 'advanced',
            description: 'Advanced: custom IP address range for this subnet',
            default: '10.0.1.0/24',
            placeholder: 'e.g. 10.0.1.0/24',
          },
        ],
      },
      {
        id: 'load-balancer',
        name: 'Load Balancer',
        description: 'Distribute traffic across multiple targets',
        icon: 'GitBranch',
        category: 'networking',
        behavior: 'connector' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure', 'kubernetes'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:elasticloadbalancingv2:LoadBalancer',
            display_name: 'ALB/NLB',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:compute:ForwardingRule',
            display_name: 'Cloud Load Balancer',
          },
          {
            provider: 'azure',
            resource_type: 'azure:network:LoadBalancer',
            display_name: 'Azure Load Balancer',
          },
          {
            provider: 'kubernetes',
            resource_type: 'kubernetes:core/v1:Service',
            display_name: 'K8s Service (LoadBalancer)',
          },
        ],
        keywords: ['load', 'balancer', 'alb', 'elb', 'nlb', 'lb'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this load balancer',
            placeholder: 'My Load Balancer',
          },
          {
            name: 'type',
            label: 'Load balancer type',
            type: 'select',
            required: false,
            tier: 'essential',
            description: 'Type of load balancer — determines protocol support and features',
            default: 'alb',
            optionDetails: [
              {
                value: 'alb',
                label: 'Application LB (ALB)',
                description: 'HTTP/HTTPS · path routing · WebSocket',
                cost: '~$22/mo + LCU',
                provider: 'aws',
              },
              {
                value: 'nlb',
                label: 'Network LB (NLB)',
                description: 'TCP/UDP · ultra-low latency · static IP',
                cost: '~$22/mo + LCU',
                provider: 'aws',
              },
              {
                value: 'gcp-http',
                label: 'HTTP(S) LB',
                description: 'Global HTTP/HTTPS · URL maps',
                cost: '~$18/mo + data',
                provider: 'gcp',
              },
              {
                value: 'gcp-tcp',
                label: 'TCP/UDP LB',
                description: 'Regional · network traffic',
                cost: '~$18/mo + data',
                provider: 'gcp',
              },
              {
                value: 'azure-standard',
                label: 'Standard LB',
                description: 'TCP/UDP · zone-redundant',
                cost: '~$18/mo + rules',
                provider: 'azure',
              },
              {
                value: 'azure-app-gw',
                label: 'Application Gateway',
                description: 'HTTP/HTTPS · WAF · SSL offload',
                cost: '~$55/mo + data',
                provider: 'azure',
              },
              {
                value: 'k8s-service',
                label: 'K8s Service',
                description: 'LoadBalancer type service',
                provider: 'kubernetes',
              },
              {
                value: 'k8s-ingress',
                label: 'K8s Ingress',
                description: 'HTTP routing · path-based',
                provider: 'kubernetes',
              },
            ],
          },
          {
            name: 'internal_only',
            label: 'Internal only?',
            type: 'boolean',
            required: false,
            tier: 'detailed',
            description: 'Only accessible by other services in your network (not the public internet)',
            default: false,
          },
        ],
      },
      {
        id: 'cdn',
        name: 'CDN',
        description: 'Content delivery network for global distribution',
        icon: 'Globe',
        category: 'networking',
        behavior: 'connector' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:cloudfront:Distribution',
            display_name: 'CloudFront',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:compute:GlobalForwardingRule',
            display_name: 'Cloud CDN',
          },
          { provider: 'azure', resource_type: 'azure:cdn:Endpoint', display_name: 'Azure CDN' },
        ],
        keywords: ['cdn', 'cloudfront', 'cloudflare', 'fastly', 'akamai'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this CDN',
            placeholder: 'My CDN',
          },
          {
            name: 'tier',
            label: 'Price class',
            type: 'select',
            required: false,
            tier: 'essential',
            description: 'CDN edge locations — more locations = faster worldwide but costs more',
            default: 'cf-all',
            optionDetails: [
              {
                value: 'cf-100',
                label: 'Price Class 100',
                description: 'US, Canada, Europe only',
                cost: '~$0.085/GB',
                provider: 'aws',
              },
              {
                value: 'cf-200',
                label: 'Price Class 200',
                description: '+ Asia, Africa, Middle East',
                cost: '~$0.120/GB',
                provider: 'aws',
              },
              {
                value: 'cf-all',
                label: 'All Edge Locations',
                description: 'Global — all regions',
                cost: '~$0.085–0.170/GB',
                provider: 'aws',
              },
              {
                value: 'gcp-standard',
                label: 'Standard',
                description: 'Cloud CDN — cache at Google edge',
                cost: '~$0.08/GB',
                provider: 'gcp',
              },
              {
                value: 'gcp-premium',
                label: 'Premium',
                description: 'Cloud CDN — premium network tier',
                cost: '~$0.12/GB',
                provider: 'gcp',
              },
              {
                value: 'azure-standard',
                label: 'Standard Microsoft',
                description: 'Microsoft CDN network',
                cost: '~$0.081/GB',
                provider: 'azure',
              },
              {
                value: 'azure-premium-verizon',
                label: 'Premium Verizon',
                description: 'Advanced rules, analytics',
                cost: '~$0.150/GB',
                provider: 'azure',
              },
              {
                value: 'azure-afd',
                label: 'Azure Front Door',
                description: 'Global LB + CDN combined',
                cost: '~$35/mo + $0.08/GB',
                provider: 'azure',
              },
            ],
          },
          {
            name: 'custom_domain',
            label: 'Custom domain',
            type: 'string',
            required: false,
            tier: 'detailed',
            description: 'Use your own domain for the CDN',
            placeholder: 'e.g. cdn.example.com',
          },
        ],
      },
      {
        id: 'api-gateway',
        name: 'API Gateway',
        description: 'Managed API endpoint with routing and auth',
        icon: 'Server',
        category: 'networking',
        behavior: 'connector' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:apigatewayv2:Api', display_name: 'API Gateway' },
          { provider: 'gcp', resource_type: 'gcp:apigateway:Gateway', display_name: 'API Gateway' },
          {
            provider: 'azure',
            resource_type: 'azure:apimanagement:Api',
            display_name: 'API Management',
          },
        ],
        keywords: ['api', 'gateway', 'rest', 'http', 'websocket'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this gateway',
            placeholder: 'My API Gateway',
          },
          {
            name: 'protocol',
            label: 'Protocol',
            type: 'select',
            required: false,
            tier: 'essential',
            description: 'API protocol type — determines features and pricing',
            default: 'http',
            optionDetails: [
              {
                value: 'http',
                label: 'HTTP API',
                description: 'Simple, low-cost HTTP routing',
                cost: '~$1.00/M requests',
                provider: 'aws',
              },
              {
                value: 'rest',
                label: 'REST API',
                description: 'Full-featured · API keys, caching, WAF',
                cost: '~$3.50/M requests',
                provider: 'aws',
              },
              {
                value: 'websocket',
                label: 'WebSocket',
                description: 'Persistent bi-directional connections',
                cost: '~$1.00/M messages',
                provider: 'aws',
              },
              {
                value: 'gcp-api-gw',
                label: 'API Gateway',
                description: 'Managed API routing',
                cost: '~$3/M calls',
                provider: 'gcp',
              },
              {
                value: 'azure-consumption',
                label: 'Consumption',
                description: 'Pay-per-call · auto-scaling',
                cost: '~$3.50/M calls',
                provider: 'azure',
              },
              {
                value: 'azure-standard',
                label: 'Standard v2',
                description: 'Fixed capacity · full features',
                cost: '~$170/mo',
                provider: 'azure',
              },
            ],
          },
          {
            name: 'routes',
            label: 'Routes',
            type: 'list',
            required: false,
            tier: 'essential',
            description: 'URL paths this gateway should handle',
            placeholder: 'e.g. /api/users',
            addLabel: 'Add a route',
          },
          {
            name: 'login_required',
            label: 'Require login?',
            type: 'boolean',
            required: false,
            tier: 'detailed',
            description: 'Require authentication before requests reach your services',
            default: false,
          },
        ],
      },
      {
        id: 'dns-zone',
        name: 'DNS Zone',
        description: 'Manage DNS records for your domain',
        icon: 'Globe',
        category: 'networking',
        behavior: 'singleton' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:route53:Zone',
            display_name: 'Route 53 Hosted Zone',
          },
          { provider: 'gcp', resource_type: 'gcp:dns:ManagedZone', display_name: 'Cloud DNS Zone' },
          { provider: 'azure', resource_type: 'azure:dns:Zone', display_name: 'Azure DNS Zone' },
        ],
        keywords: ['dns', 'route53', 'domain', 'zone', 'cloudflare'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this DNS zone',
            placeholder: 'My Domain',
          },
          {
            name: 'domain',
            label: 'Domain name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'The domain you want to manage',
            placeholder: 'e.g. example.com',
          },
          {
            name: 'subdomains',
            label: 'Subdomains',
            type: 'list',
            required: false,
            tier: 'detailed',
            description: 'Subdomains to set up (we will create the DNS records)',
            placeholder: 'e.g. api, www, app',
            addLabel: 'Add a subdomain',
          },
        ],
      },
    ],
  },
  {
    id: 'messaging',
    name: 'Messaging',
    description: 'Queues, pub/sub, and event streaming',
    icon: 'MessageSquare',
    resources: [
      {
        id: 'message-queue',
        name: 'Message Queue',
        description: 'Reliable async message delivery',
        icon: 'List',
        category: 'messaging',
        behavior: 'streaming' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:sqs:Queue', display_name: 'SQS Queue' },
          {
            provider: 'gcp',
            resource_type: 'gcp:pubsub:Subscription',
            display_name: 'Pub/Sub Subscription',
          },
          {
            provider: 'azure',
            resource_type: 'azure:servicebus:Queue',
            display_name: 'Service Bus Queue',
          },
        ],
        keywords: ['sqs', 'queue', 'rabbitmq', 'message', 'pubsub'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this queue',
            placeholder: 'My Queue',
          },
          {
            name: 'queue_type',
            label: 'Queue type',
            type: 'select',
            required: false,
            tier: 'essential',
            description: 'Queue delivery model — affects ordering, throughput, and cost',
            default: 'standard',
            tooltip:
              'AWS SQS: Standard (unlimited throughput, at-least-once) or FIFO (ordered, exactly-once, up to 70K msg/s). GCP Pub/Sub: Pull or Push delivery. Azure Service Bus: Basic (queues only), Standard (+ topics), Premium (dedicated, 100 MB messages).',
            optionDetails: [
              {
                value: 'standard',
                label: 'Standard',
                description: 'Unlimited throughput · at-least-once delivery',
                cost: '~$0.40/M msgs',
                provider: 'aws',
                tooltip:
                  'Messages may be delivered more than once and in any order. Use for workloads that can handle duplicates.',
              },
              {
                value: 'fifo',
                label: 'FIFO',
                description: 'Ordered · exactly-once · 3,000 msg/s',
                cost: '~$0.50/M msgs',
                provider: 'aws',
                tooltip:
                  'Guarantees message order and exactly-once processing. 3,000 messages/s without batching, 30,000 with batching.',
              },
              {
                value: 'fifo-high-throughput',
                label: 'FIFO High Throughput',
                description: 'Ordered · exactly-once · 70,000 msg/s',
                cost: '~$0.50/M msgs',
                provider: 'aws',
                tooltip: 'Same guarantees as FIFO but with higher throughput. Requires message group IDs.',
              },
              {
                value: 'pull',
                label: 'Pull subscription',
                description: 'Consumer polls for messages',
                provider: 'gcp',
                tooltip:
                  'Your application pulls messages when ready. Best for batch processing and when consumers need flow control.',
              },
              {
                value: 'push',
                label: 'Push subscription',
                description: 'HTTP push to endpoint',
                provider: 'gcp',
                tooltip:
                  'Pub/Sub pushes messages to an HTTP endpoint. Best for real-time processing with Cloud Run or Cloud Functions.',
              },
              {
                value: 'basic',
                label: 'Basic',
                description: '256 KB max · queues only',
                cost: '~$0.05/M ops',
                provider: 'azure',
                tooltip:
                  'Shared infrastructure. No topics, sessions, or dead-lettering. Best for simple queue workloads.',
              },
              {
                value: 'standard-azure',
                label: 'Standard',
                description: '256 KB max · topics + filters',
                cost: '~$10/mo',
                provider: 'azure',
                tooltip:
                  'Shared infrastructure. Adds topics, subscriptions, filters, sessions, and dead-letter queues.',
              },
              {
                value: 'premium',
                label: 'Premium',
                description: '100 MB max · dedicated resources',
                cost: '~$677/mo',
                provider: 'azure',
                tooltip:
                  'Dedicated resources with predictable performance. Up to 100 MB messages. Required for geo-disaster recovery.',
              },
            ],
          },
          {
            name: 'retention',
            label: 'Message retention',
            type: 'select',
            required: false,
            tier: 'detailed',
            description: 'How long unprocessed messages are kept before being discarded',
            default: '4d',
            tooltip:
              'AWS SQS: 60 seconds – 14 days (default 4 days). GCP Pub/Sub: 10 minutes – 31 days (default 7 days). Azure Service Bus: 1 second – 14 days (Standard) or unlimited (Premium).',
            optionDetails: [
              // AWS SQS: 60 seconds – 14 days
              {
                value: '60s',
                label: '60 seconds',
                description: 'Minimum — very short-lived messages',
                provider: 'aws',
              },
              { value: '1h', label: '1 hour', description: 'Short-lived messages only', provider: 'aws' },
              { value: '4d', label: '4 days', description: 'Default — good for most workloads', provider: 'aws' },
              { value: '7d', label: '7 days', description: 'Extended retention', provider: 'aws' },
              { value: '14d', label: '14 days', description: 'Maximum', provider: 'aws' },
              { value: 'custom', label: 'Custom', description: 'Enter retention (60s – 14 days)', provider: 'aws' },
              // GCP Pub/Sub: 10 minutes – 31 days
              { value: '1h', label: '1 hour', description: 'Short-lived messages only', provider: 'gcp' },
              { value: '1d', label: '1 day', description: 'Daily processing window', provider: 'gcp' },
              { value: '7d', label: '7 days', description: 'Default — good for most workloads', provider: 'gcp' },
              { value: '14d', label: '14 days', description: 'Extended retention', provider: 'gcp' },
              { value: '31d', label: '31 days', description: 'Maximum', provider: 'gcp' },
              { value: 'custom', label: 'Custom', description: 'Enter retention (10 min – 31 days)', provider: 'gcp' },
              // Azure Service Bus: varies by tier
              { value: '1d', label: '1 day', description: 'Short retention', provider: 'azure' },
              { value: '7d', label: '7 days', description: 'Standard retention', provider: 'azure' },
              { value: '14d', label: '14 days', description: 'Maximum (Standard tier)', provider: 'azure' },
              { value: 'custom', label: 'Custom', description: 'Enter retention in days', provider: 'azure' },
            ],
            customInput: { type: 'number', unit: 'hours', min: 1, max: 744, step: 1, placeholder: 'e.g. 48' },
          },
          {
            name: 'max_message_size',
            label: 'Max message size',
            type: 'select',
            required: false,
            tier: 'detailed',
            description: 'Maximum size of a single message',
            default: '256',
            tooltip:
              'AWS SQS: 1 byte – 256 KB (up to 2 GB via S3 Extended Client Library). GCP Pub/Sub: up to 10 MB per message. Azure Service Bus: 256 KB (Basic/Standard) or 100 MB (Premium).',
            optionDetails: [
              // AWS SQS: 1 byte – 256 KB
              { value: '1', label: '1 KB', description: 'Tiny messages — event signals', provider: 'aws' },
              { value: '16', label: '16 KB', description: 'Small — JSON payloads', provider: 'aws' },
              { value: '64', label: '64 KB', description: 'Medium — API responses', provider: 'aws' },
              {
                value: '256',
                label: '256 KB',
                description: 'Maximum',
                provider: 'aws',
                tooltip: 'For larger payloads, use the SQS Extended Client Library with S3 (up to 2 GB).',
              },
              // GCP Pub/Sub: up to 10 MB
              { value: '64', label: '64 KB', description: 'Small messages', provider: 'gcp' },
              { value: '256', label: '256 KB', description: 'Standard messages', provider: 'gcp' },
              { value: '1024', label: '1 MB', description: 'Large messages', provider: 'gcp' },
              { value: '5120', label: '5 MB', description: 'Very large messages', provider: 'gcp' },
              { value: '10240', label: '10 MB', description: 'Maximum', provider: 'gcp' },
              // Azure Service Bus: 256 KB (Basic/Standard) or 100 MB (Premium)
              { value: '64', label: '64 KB', description: 'Small messages', provider: 'azure' },
              { value: '256', label: '256 KB', description: 'Maximum (Basic/Standard tier)', provider: 'azure' },
              {
                value: '1024',
                label: '1 MB',
                description: 'Premium tier',
                provider: 'azure',
                tooltip: 'Requires Premium tier Service Bus',
              },
              {
                value: '102400',
                label: '100 MB',
                description: 'Maximum (Premium tier)',
                provider: 'azure',
                tooltip: 'Requires Premium tier Service Bus',
              },
            ],
            customInput: { type: 'number', unit: 'KB', min: 1, max: 1048576, step: 1, placeholder: 'e.g. 128' },
          },
          {
            name: 'dead_letter',
            label: 'Dead-letter queue?',
            type: 'boolean',
            required: false,
            tier: 'detailed',
            description: 'Automatically move failed messages to a separate queue for investigation',
            default: true,
            tooltip:
              'Messages that fail processing after a set number of retries are moved to a dead-letter queue. Prevents poison messages from blocking the queue. Recommended for production.',
          },
          {
            name: 'queues',
            label: 'Queues',
            type: 'queue_list',
            required: false,
            tier: 'essential',
            description:
              'Named queues to create on this message broker. Each entry is a queue name your code will publish to / consume from.',
            placeholder: 'e.g. orders, emails, thumbnails',
            addLabel: 'Add a queue',
          },
        ],
      },
      {
        id: 'event-bus',
        name: 'Event Bus',
        description: 'Publish-subscribe event routing',
        icon: 'Radio',
        category: 'messaging',
        behavior: 'streaming' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:sns:Topic', display_name: 'SNS Topic' },
          { provider: 'gcp', resource_type: 'gcp:pubsub:Topic', display_name: 'Pub/Sub Topic' },
          {
            provider: 'azure',
            resource_type: 'azure:eventgrid:Topic',
            display_name: 'Event Grid Topic',
          },
        ],
        keywords: ['eventbridge', 'sns', 'topic', 'pubsub', 'event'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this event bus',
            placeholder: 'My Events',
          },
          {
            name: 'topic_type',
            label: 'Topic type',
            type: 'select',
            required: false,
            tier: 'essential',
            description: 'Delivery model — affects ordering, deduplication, and throughput',
            default: 'standard',
            optionDetails: [
              {
                value: 'standard',
                label: 'Standard',
                description: 'Unlimited throughput · best-effort ordering',
                cost: '~$0.50/M msgs',
                provider: 'aws',
              },
              {
                value: 'fifo',
                label: 'FIFO',
                description: 'Strict ordering · exactly-once · 300 msg/s',
                cost: '~$0.50/M msgs',
                provider: 'aws',
              },
              {
                value: 'gcp-default',
                label: 'Default',
                description: 'Global, at-least-once delivery',
                provider: 'gcp',
              },
              {
                value: 'azure-standard',
                label: 'Standard',
                description: 'Event Grid standard tier',
                cost: '~$0.60/M ops',
                provider: 'azure',
              },
            ],
          },
          {
            name: 'subscribers',
            label: 'Who listens to these events?',
            type: 'list',
            required: false,
            tier: 'essential',
            description: 'Services that should receive events from this bus',
            placeholder: 'e.g. email-service',
            addLabel: 'Add a subscriber',
          },
        ],
      },
      {
        id: 'rabbitmq',
        name: 'RabbitMQ',
        description: 'Open-source message broker with advanced routing',
        icon: 'Inbox',
        category: 'messaging',
        behavior: 'streaming' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure', 'kubernetes'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:mq:Broker', display_name: 'Amazon MQ (RabbitMQ)' },
          { provider: 'gcp', resource_type: 'gcp:cloudamqp:Instance', display_name: 'CloudAMQP' },
          {
            provider: 'azure',
            resource_type: 'azure:servicebus:Namespace',
            display_name: 'Service Bus',
          },
          {
            provider: 'kubernetes',
            resource_type: 'kubernetes:apps/v1:StatefulSet',
            display_name: 'RabbitMQ Operator',
          },
        ],
        keywords: ['rabbitmq', 'amqp', 'mq', 'broker', 'rabbit'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this message broker',
            placeholder: 'My Message Broker',
          },
          {
            name: 'size',
            label: 'Broker size',
            type: 'select',
            required: true,
            tier: 'essential',
            description: 'Broker instance size — determines throughput and connections',
            default: 'mq.m5.large',
            optionDetails: [
              {
                value: 'mq.t3.micro',
                label: 'mq.t3.micro',
                description: '2 vCPU · 1 GB · dev/test',
                cost: '~$22/mo',
                provider: 'aws',
              },
              {
                value: 'mq.m5.large',
                label: 'mq.m5.large',
                description: '2 vCPU · 8 GB · production',
                cost: '~$175/mo',
                provider: 'aws',
              },
              {
                value: 'mq.m5.xlarge',
                label: 'mq.m5.xlarge',
                description: '4 vCPU · 16 GB · heavy load',
                cost: '~$350/mo',
                provider: 'aws',
              },
              {
                value: 'mq.m5.2xlarge',
                label: 'mq.m5.2xlarge',
                description: '8 vCPU · 32 GB · high throughput',
                cost: '~$700/mo',
                provider: 'aws',
              },
              {
                value: 'lemur',
                label: 'Lemur',
                description: '1 vCPU · shared · dev only',
                cost: 'Free',
                provider: 'gcp',
              },
              {
                value: 'tiger',
                label: 'Tiger',
                description: '2 vCPU · 8 GB · production',
                cost: '~$99/mo',
                provider: 'gcp',
              },
              {
                value: 'lion',
                label: 'Lion',
                description: '4 vCPU · 16 GB · heavy load',
                cost: '~$399/mo',
                provider: 'gcp',
              },
              {
                value: 'k8s-1-2',
                label: '1 vCPU / 2 GB',
                description: 'K8s pod — light workload',
                provider: 'kubernetes',
              },
              { value: 'k8s-2-4', label: '2 vCPU / 4 GB', description: 'K8s pod — standard', provider: 'kubernetes' },
              { value: 'k8s-4-8', label: '4 vCPU / 8 GB', description: 'K8s pod — heavy load', provider: 'kubernetes' },
            ],
          },
          {
            name: 'version',
            label: 'Version',
            type: 'select',
            required: false,
            tier: 'essential',
            description: 'RabbitMQ engine version',
            default: '3.13',
            optionDetails: [
              { value: '3.13', label: 'RabbitMQ 3.13', description: 'Latest stable (recommended)' },
              { value: '3.12', label: 'RabbitMQ 3.12', description: 'Previous stable' },
            ],
          },
          {
            name: 'queues',
            label: 'Queues',
            type: 'list',
            required: false,
            tier: 'detailed',
            description: 'Add the queues this broker should manage',
            placeholder: 'e.g. order-processing',
            addLabel: 'Add a queue',
          },
          {
            name: 'keep_messages',
            label: 'Keep messages if broker restarts?',
            type: 'boolean',
            required: false,
            tier: 'detailed',
            description: 'Saves messages to disk so they survive restarts (recommended for production)',
            default: true,
          },
          {
            name: 'always_available',
            label: 'Always available (production)?',
            type: 'boolean',
            required: false,
            tier: 'detailed',
            description: 'Runs in multiple zones so the broker stays up even if one goes down',
            default: false,
          },
        ],
      },
      {
        id: 'cloud-pubsub',
        name: 'Cloud Pub/Sub',
        description: 'Global managed pub/sub messaging service',
        icon: 'Radio',
        category: 'messaging',
        behavior: 'streaming' as NodeBehavior,
        providers: ['gcp'],
        implementations: [{ provider: 'gcp', resource_type: 'gcp:pubsub:Topic', display_name: 'Pub/Sub Topic' }],
        keywords: ['pubsub', 'pub/sub', 'gcp', 'topic', 'subscription', 'messaging'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this message channel',
            placeholder: 'My Channel',
          },
          {
            name: 'subscribers',
            label: 'Who listens?',
            type: 'list',
            required: false,
            tier: 'essential',
            description: 'Services that receive messages from this channel',
            placeholder: 'e.g. email-sender',
            addLabel: 'Add a listener',
          },
          {
            name: 'keep_messages',
            label: 'How long to keep undelivered messages?',
            type: 'select',
            required: false,
            tier: 'detailed',
            description: 'How long to hold messages if a listener is down',
            options: ['1 day', '3 days', '7 days', '30 days'],
            default: '7 days',
          },
          {
            name: 'order_matters',
            label: 'Order matters?',
            type: 'boolean',
            required: false,
            tier: 'detailed',
            description: 'Messages must arrive in the exact order they were sent',
            default: false,
          },
        ],
      },
      {
        id: 'service-bus',
        name: 'Service Bus',
        description: 'Enterprise messaging with queues and topics',
        icon: 'List',
        category: 'messaging',
        behavior: 'streaming' as NodeBehavior,
        providers: ['azure'],
        implementations: [
          {
            provider: 'azure',
            resource_type: 'azure:servicebus:Namespace',
            display_name: 'Service Bus Namespace',
          },
        ],
        keywords: ['servicebus', 'service-bus', 'azure', 'queue', 'topic', 'enterprise'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this message bus',
            placeholder: 'My Service Bus',
          },
          {
            name: 'size',
            label: 'Tier',
            type: 'select',
            required: true,
            tier: 'essential',
            description: 'Service Bus tier — determines features, throughput, and isolation',
            default: 'standard',
            optionDetails: [
              {
                value: 'basic',
                label: 'Basic',
                description: 'Queues only · 256 KB messages',
                cost: '~$0.05/M ops',
                provider: 'azure',
              },
              {
                value: 'standard',
                label: 'Standard',
                description: 'Queues + topics · 256 KB messages',
                cost: '~$10/mo base',
                provider: 'azure',
              },
              {
                value: 'premium-1',
                label: 'Premium (1 MU)',
                description: 'Dedicated · 100 MB messages · 1 messaging unit',
                cost: '~$677/mo',
                provider: 'azure',
              },
              {
                value: 'premium-2',
                label: 'Premium (2 MU)',
                description: 'Dedicated · 100 MB messages · 2 messaging units',
                cost: '~$1,354/mo',
                provider: 'azure',
              },
              {
                value: 'premium-4',
                label: 'Premium (4 MU)',
                description: 'Dedicated · 100 MB messages · 4 messaging units',
                cost: '~$2,708/mo',
                provider: 'azure',
              },
            ],
          },
          {
            name: 'queues',
            label: 'Queues',
            type: 'list',
            required: false,
            tier: 'detailed',
            description: 'Named queues to set up',
            placeholder: 'e.g. orders',
            addLabel: 'Add a queue',
          },
          {
            name: 'topics',
            label: 'Topics',
            type: 'list',
            required: false,
            tier: 'detailed',
            description: 'Named topics for pub/sub messaging',
            placeholder: 'e.g. user-events',
            addLabel: 'Add a topic',
          },
        ],
      },
      {
        id: 'email-service',
        name: 'Email Service',
        description: 'Transactional email — confirmations, password resets, receipts, alerts',
        icon: 'Mail',
        category: 'messaging',
        behavior: 'singleton' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:ses:DomainIdentity', display_name: 'Amazon SES' },
          {
            provider: 'gcp',
            resource_type: 'gcp:cloudfunctions:Function',
            display_name: 'SendGrid via Cloud Function',
          },
          {
            provider: 'azure',
            resource_type: 'azure:communication:EmailService',
            display_name: 'Azure Communication Email',
          },
        ],
        keywords: ['email', 'smtp', 'ses', 'sendgrid', 'postmark', 'transactional', 'mail'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this email service',
            placeholder: 'My Email Service',
          },
          {
            name: 'from_address',
            label: 'From address',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'The verified sender address that outgoing email will be sent from',
            placeholder: 'noreply@example.com',
          },
          {
            name: 'from_name',
            label: 'From name',
            type: 'string',
            required: false,
            tier: 'essential',
            description: 'The human-friendly sender name shown in inbox',
            placeholder: 'My App',
          },
          {
            name: 'reply_to',
            label: 'Reply-to address',
            type: 'string',
            required: false,
            tier: 'detailed',
            description: 'Address users see when they hit reply. Defaults to from_address if blank.',
            placeholder: 'support@example.com',
          },
          {
            name: 'domain',
            label: 'Sending domain',
            type: 'string',
            required: false,
            tier: 'detailed',
            description: 'Domain to verify for DKIM/SPF. Required for deliverability at volume.',
            placeholder: 'example.com',
          },
          {
            name: 'daily_quota',
            label: 'Daily send quota',
            type: 'number',
            required: false,
            tier: 'detailed',
            description: 'Soft cap on daily outbound emails — providers enforce ramp-up limits',
            default: 200,
          },
        ],
      },
      {
        id: 'event-stream',
        name: 'Event Stream',
        description: 'High-throughput event streaming',
        icon: 'Activity',
        category: 'messaging',
        behavior: 'streaming' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:kinesis:Stream',
            display_name: 'Kinesis Data Stream',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:pubsub:Topic',
            display_name: 'Pub/Sub (Streaming)',
          },
          {
            provider: 'azure',
            resource_type: 'azure:eventhub:EventHub',
            display_name: 'Event Hubs',
          },
        ],
        keywords: ['kinesis', 'kafka', 'stream', 'event', 'data'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this event stream',
            placeholder: 'My Stream',
          },
          {
            name: 'size',
            label: 'Throughput',
            type: 'select',
            required: true,
            tier: 'essential',
            description: 'Stream capacity — shards determine max throughput',
            default: 'on-demand',
            optionDetails: [
              {
                value: 'on-demand',
                label: 'On-demand',
                description: 'Auto-scales · up to 200 MB/s write',
                cost: '~$0.08/GB',
                provider: 'aws',
              },
              {
                value: '1-shard',
                label: '1 shard',
                description: '1 MB/s write · 2 MB/s read',
                cost: '~$11/mo',
                provider: 'aws',
              },
              {
                value: '2-shards',
                label: '2 shards',
                description: '2 MB/s write · 4 MB/s read',
                cost: '~$22/mo',
                provider: 'aws',
              },
              {
                value: '4-shards',
                label: '4 shards',
                description: '4 MB/s write · 8 MB/s read',
                cost: '~$44/mo',
                provider: 'aws',
              },
              {
                value: '10-shards',
                label: '10 shards',
                description: '10 MB/s write · 20 MB/s read',
                cost: '~$110/mo',
                provider: 'aws',
              },
              {
                value: 'gcp-default',
                label: 'Default',
                description: 'Auto-scales · unlimited throughput',
                cost: '~$40/TB ingested',
                provider: 'gcp',
              },
              {
                value: 'eh-basic',
                label: 'Basic (1 TU)',
                description: '1 MB/s ingress · 2 MB/s egress',
                cost: '~$11/mo',
                provider: 'azure',
              },
              {
                value: 'eh-standard',
                label: 'Standard (2 TU)',
                description: '2 MB/s ingress · 4 MB/s egress',
                cost: '~$22/mo',
                provider: 'azure',
              },
              {
                value: 'eh-standard-4',
                label: 'Standard (4 TU)',
                description: '4 MB/s ingress · 8 MB/s egress',
                cost: '~$44/mo',
                provider: 'azure',
              },
              {
                value: 'eh-premium',
                label: 'Premium (1 PU)',
                description: 'Dedicated · isolation',
                cost: '~$685/mo',
                provider: 'azure',
              },
            ],
          },
          {
            name: 'retention',
            label: 'Data retention',
            type: 'select',
            required: false,
            tier: 'essential',
            description: 'How far back consumers can replay data',
            default: '24h',
            tooltip:
              'AWS Kinesis: 24 hours default, extendable up to 8,760 hours (365 days). GCP Pub/Sub: 10 minutes – 31 days. Azure Event Hubs: 1 – 90 days (Standard), up to 90 days (Premium/Dedicated).',
            optionDetails: [
              // AWS Kinesis: 24 hours – 365 days
              {
                value: '24h',
                label: '24 hours',
                description: 'Default (included free)',
                provider: 'aws',
                tooltip: 'Extended retention beyond 24h costs ~$0.02/shard/hr',
              },
              { value: '72h', label: '3 days', description: 'Extended replay window', provider: 'aws' },
              { value: '168h', label: '7 days', description: 'Standard extended retention', provider: 'aws' },
              { value: '720h', label: '30 days', description: 'Long retention', provider: 'aws' },
              {
                value: '8760h',
                label: '365 days',
                description: 'Maximum — compliance or full replay',
                provider: 'aws',
              },
              { value: 'custom', label: 'Custom', description: 'Enter retention (24h – 8,760h)', provider: 'aws' },
              // GCP Pub/Sub: 10 minutes – 31 days
              { value: '24h', label: '24 hours', description: 'Standard retention', provider: 'gcp' },
              { value: '72h', label: '3 days', description: 'Extended replay window', provider: 'gcp' },
              { value: '168h', label: '7 days', description: 'Default', provider: 'gcp' },
              { value: '720h', label: '30 days', description: 'Near-maximum', provider: 'gcp' },
              { value: 'custom', label: 'Custom', description: 'Enter retention (10 min – 31 days)', provider: 'gcp' },
              // Azure Event Hubs: 1 – 90 days
              { value: '24h', label: '24 hours', description: 'Standard retention', provider: 'azure' },
              { value: '72h', label: '3 days', description: 'Extended replay window', provider: 'azure' },
              { value: '168h', label: '7 days', description: 'Default', provider: 'azure' },
              { value: '720h', label: '30 days', description: 'Long retention', provider: 'azure' },
              { value: '2160h', label: '90 days', description: 'Maximum', provider: 'azure' },
              { value: 'custom', label: 'Custom', description: 'Enter retention (1 – 90 days)', provider: 'azure' },
            ],
            customInput: { type: 'number', unit: 'hours', min: 1, max: 8760, step: 1, placeholder: 'e.g. 48' },
          },
        ],
      },
    ],
  },
  {
    id: 'security',
    name: 'Security',
    description: 'IAM, secrets, and certificates',
    icon: 'Shield',
    resources: [
      {
        id: 'secret-store',
        name: 'Secret Store',
        description: 'Securely store API keys and credentials',
        icon: 'Key',
        category: 'security',
        behavior: 'singleton' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure', 'kubernetes'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:secretsmanager:Secret',
            display_name: 'Secrets Manager',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:secretmanager:Secret',
            display_name: 'Secret Manager',
          },
          {
            provider: 'azure',
            resource_type: 'azure:keyvault:Secret',
            display_name: 'Key Vault Secret',
          },
          {
            provider: 'kubernetes',
            resource_type: 'kubernetes:core/v1:Secret',
            display_name: 'K8s Secret',
          },
        ],
        keywords: ['secret', 'vault', 'ssm', 'parameter', 'credential'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this secret',
            placeholder: 'My Secret',
          },
          {
            name: 'secrets',
            label: 'Secret values',
            type: 'list',
            required: false,
            tier: 'essential',
            description: 'The secret key-value pairs to store',
            placeholder: 'e.g. STRIPE_API_KEY',
            addLabel: 'Add a secret',
          },
          {
            name: 'auto_rotate',
            label: 'Auto-rotate?',
            type: 'boolean',
            required: false,
            tier: 'detailed',
            description: 'Automatically change this secret on a schedule for better security',
            default: false,
          },
        ],
      },
      {
        id: 'ssl-certificate',
        name: 'SSL Certificate',
        description: 'HTTPS certificates for your domains',
        icon: 'Lock',
        category: 'security',
        behavior: 'singleton' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:acm:Certificate',
            display_name: 'ACM Certificate',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:compute:ManagedSslCertificate',
            display_name: 'Managed SSL Certificate',
          },
          {
            provider: 'azure',
            resource_type: 'azure:keyvault:Certificate',
            display_name: 'Key Vault Certificate',
          },
        ],
        keywords: ['ssl', 'tls', 'certificate', 'acm', 'https'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this certificate',
            placeholder: 'My SSL Cert',
          },
          {
            name: 'domain',
            label: 'Domain',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'The domain this certificate secures',
            placeholder: 'e.g. example.com',
          },
          {
            name: 'extra_domains',
            label: 'Additional domains',
            type: 'list',
            required: false,
            tier: 'detailed',
            description: 'Other domains this certificate should cover',
            placeholder: 'e.g. www.example.com',
            addLabel: 'Add a domain',
          },
          {
            name: 'auto_renew',
            label: 'Auto-renew?',
            type: 'boolean',
            required: false,
            tier: 'detailed',
            description: 'Automatically renew before it expires (recommended)',
            default: true,
          },
        ],
      },
      {
        id: 'service-account',
        name: 'Service Account',
        description: 'Identity for your services',
        icon: 'User',
        category: 'security',
        behavior: 'singleton' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure', 'kubernetes'],
        implementations: [
          { provider: 'aws', resource_type: 'aws:iam:Role', display_name: 'IAM Role' },
          {
            provider: 'gcp',
            resource_type: 'gcp:serviceaccount:Account',
            display_name: 'Service Account',
          },
          {
            provider: 'azure',
            resource_type: 'azure:managedidentity:UserAssignedIdentity',
            display_name: 'Managed Identity',
          },
          {
            provider: 'kubernetes',
            resource_type: 'kubernetes:core/v1:ServiceAccount',
            display_name: 'K8s Service Account',
          },
        ],
        keywords: ['iam', 'role', 'service', 'account', 'identity'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this identity',
            placeholder: 'My Service Account',
          },
          {
            name: 'services',
            label: 'Which services use this identity?',
            type: 'list',
            required: false,
            tier: 'detailed',
            description: 'Services that will act as this identity',
            placeholder: 'e.g. backend-api',
            addLabel: 'Add a service',
          },
        ],
      },
    ],
  },
  {
    id: 'monitoring',
    name: 'Monitoring',
    description: 'Logs, metrics, and alerts',
    icon: 'Activity',
    resources: [
      {
        id: 'log-group',
        name: 'Log Group',
        description: 'Centralized application logging with real-time streaming',
        icon: 'FileText',
        category: 'monitoring',
        behavior: 'streaming' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:cloudwatch:LogGroup',
            display_name: 'CloudWatch Logs',
          },
          { provider: 'gcp', resource_type: 'gcp:logging:Sink', display_name: 'Cloud Logging' },
          {
            provider: 'azure',
            resource_type: 'azure:operationalinsights:Workspace',
            display_name: 'Log Analytics',
          },
        ],
        keywords: ['log', 'cloudwatch', 'logging', 'stackdriver'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this log group',
            placeholder: 'My Logs',
          },
          {
            name: 'keep_logs',
            label: 'How long to keep logs?',
            type: 'select',
            required: false,
            tier: 'essential',
            description: 'Older logs are automatically deleted to save costs',
            options: ['7 days', '14 days', '30 days', '90 days', '1 year', 'Keep forever'],
            default: '30 days',
          },
          {
            name: 'sources',
            label: 'Which services send logs here?',
            type: 'list',
            required: false,
            tier: 'detailed',
            description: 'Services that should write to this log group',
            placeholder: 'e.g. backend-api',
            addLabel: 'Add a source',
          },
        ],
      },
      {
        id: 'alert',
        name: 'Alert',
        description: 'Get notified when things go wrong',
        icon: 'Bell',
        category: 'monitoring',
        behavior: 'singleton' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:cloudwatch:MetricAlarm',
            display_name: 'CloudWatch Alarm',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:monitoring:AlertPolicy',
            display_name: 'Cloud Monitoring Alert',
          },
          {
            provider: 'azure',
            resource_type: 'azure:monitor:MetricAlert',
            display_name: 'Azure Monitor Alert',
          },
        ],
        keywords: ['alarm', 'alert', 'cloudwatch', 'notification', 'pagerduty'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this alert',
            placeholder: 'My Alert',
          },
          {
            name: 'watch_for',
            label: 'What should trigger this alert?',
            type: 'select',
            required: true,
            tier: 'essential',
            description: 'Pick what you want to be notified about',
            options: [
              'Service is down',
              'Too many errors',
              'Service is slow',
              'Running out of storage',
              'High resource usage',
              'Custom condition',
            ],
            default: 'Too many errors',
          },
          {
            name: 'severity',
            label: 'How urgent?',
            type: 'select',
            required: false,
            tier: 'essential',
            description: 'How urgently should you be notified?',
            options: ['Low — check when convenient', 'Medium — look into it soon', 'High — wake me up at 3am'],
            default: 'Medium — look into it soon',
          },
          {
            name: 'notify',
            label: 'Who to notify?',
            type: 'list',
            required: false,
            tier: 'detailed',
            description: 'Email addresses or channels to notify',
            placeholder: 'e.g. team@example.com',
            addLabel: 'Add a recipient',
          },
        ],
      },
      {
        id: 'dashboard',
        name: 'Dashboard',
        description: 'Visualize your infrastructure metrics',
        icon: 'BarChart',
        category: 'monitoring',
        behavior: 'singleton' as NodeBehavior,
        providers: ['aws', 'gcp', 'azure'],
        implementations: [
          {
            provider: 'aws',
            resource_type: 'aws:cloudwatch:Dashboard',
            display_name: 'CloudWatch Dashboard',
          },
          {
            provider: 'gcp',
            resource_type: 'gcp:monitoring:Dashboard',
            display_name: 'Cloud Monitoring Dashboard',
          },
          {
            provider: 'azure',
            resource_type: 'azure:portal:Dashboard',
            display_name: 'Azure Dashboard',
          },
        ],
        keywords: ['dashboard', 'grafana', 'cloudwatch', 'metrics', 'datadog'],
        properties: [
          {
            name: 'name',
            label: 'Name',
            type: 'string',
            required: true,
            tier: 'essential',
            description: 'A friendly name for this dashboard',
            placeholder: 'My Dashboard',
          },
          {
            name: 'services',
            label: 'Which services to monitor?',
            type: 'list',
            required: false,
            tier: 'essential',
            description: 'Add the services you want to see on this dashboard',
            placeholder: 'e.g. backend-api',
            addLabel: 'Add a service',
          },
        ],
      },
    ],
  },
];

/**
 * Get all high-level resources flattened
 */
export function getAllHighLevelResources(): HighLevelResource[] {
  return HIGH_LEVEL_CATEGORIES.flatMap((cat) => cat.resources);
}

/**
 * Get resources formatted for the palette
 */
export function getHighLevelResourcesForPalette() {
  return HIGH_LEVEL_CATEGORIES.map((category) => ({
    category: category.name,
    categoryId: category.id,
    categoryIcon: category.icon,
    categoryDescription: category.description,
    resources: category.resources.map((resource) => ({
      ice_type: resource.id,
      display_name: resource.name,
      description: resource.description,
      category: category.name,
      icon: resource.icon,
      behavior: resource.behavior,
      providers: resource.providers,
      implementations: resource.implementations,
      properties: resource.properties,
    })),
  }));
}

/**
 * Filter resources by provider
 */
export function filterResourcesByProvider(provider: string): HighLevelResource[] {
  if (provider === 'all') {
    return getAllHighLevelResources();
  }
  return getAllHighLevelResources().filter((resource) =>
    resource.providers.includes(provider as 'aws' | 'gcp' | 'azure' | 'kubernetes'),
  );
}

/**
 * Get behavior label for display
 */
export function getBehaviorLabel(behavior: NodeBehavior): string {
  return BEHAVIOR_LABELS[behavior];
}

/**
 * Get behavior color for UI
 */
export function getBehaviorColor(behavior: NodeBehavior): string {
  return BEHAVIOR_COLORS[behavior];
}

// =============================================================================
// Cloud Asset API Type Mapping
// =============================================================================

/**
 * Map Pulumi GCP resource types to Cloud Asset API types.
 * Pulumi: gcp:cloudrun:Service -> Cloud Asset: run.googleapis.com/Service
 */
const PULUMI_TO_CLOUD_ASSET: Record<string, string> = {
  // Applications
  'gcp:cloudrun:Service': 'run.googleapis.com/Service',
  'gcp:cloudfunctions:Function': 'cloudfunctions.googleapis.com/CloudFunction',
  'gcp:appengine:StandardAppVersion': 'appengine.googleapis.com/Service',

  // Container
  'gcp:container:Cluster': 'container.googleapis.com/Cluster',

  // Databases
  'gcp:sql:DatabaseInstance': 'sqladmin.googleapis.com/Instance',
  'gcp:spanner:Instance': 'spanner.googleapis.com/Instance',
  'gcp:redis:Instance': 'redis.googleapis.com/Instance',
  'gcp:firestore:Database': 'firestore.googleapis.com/Database',

  // Storage
  'gcp:storage:Bucket': 'storage.googleapis.com/Bucket',
  'gcp:filestore:Instance': 'file.googleapis.com/Instance',

  // Messaging
  'gcp:pubsub:Topic': 'pubsub.googleapis.com/Topic',
  'gcp:pubsub:Subscription': 'pubsub.googleapis.com/Subscription',

  // Networking
  'gcp:compute:Network': 'compute.googleapis.com/Network',
  'gcp:compute:Subnetwork': 'compute.googleapis.com/Subnetwork',
  'gcp:compute:ForwardingRule': 'compute.googleapis.com/ForwardingRule',
  'gcp:compute:GlobalForwardingRule': 'compute.googleapis.com/GlobalForwardingRule',
  'gcp:apigateway:Gateway': 'apigateway.googleapis.com/Gateway',
  'gcp:dns:ManagedZone': 'dns.googleapis.com/ManagedZone',

  // Security
  'gcp:secretmanager:Secret': 'secretmanager.googleapis.com/Secret',
  'gcp:compute:ManagedSslCertificate': 'compute.googleapis.com/SslCertificate',
  'gcp:serviceaccount:Account': 'iam.googleapis.com/ServiceAccount',

  // Monitoring
  'gcp:logging:Sink': 'logging.googleapis.com/LogSink',
  'gcp:monitoring:AlertPolicy': 'monitoring.googleapis.com/AlertPolicy',
  'gcp:monitoring:Dashboard': 'monitoring.googleapis.com/Dashboard',

  // Scheduled Jobs
  'gcp:cloudscheduler:Job': 'cloudscheduler.googleapis.com/Job',

  // BigQuery
  'gcp:bigquery:Dataset': 'bigquery.googleapis.com/Dataset',
};

/**
 * Get Cloud Asset API types for all GCP high-level resources.
 * These are the business-relevant resources we want to import.
 */
export function getGCPCloudAssetTypes(): string[] {
  const assetTypes = new Set<string>();

  for (const resource of getAllHighLevelResources()) {
    for (const impl of resource.implementations) {
      if (impl.provider === 'gcp') {
        const assetType = PULUMI_TO_CLOUD_ASSET[impl.resource_type];
        if (assetType) {
          assetTypes.add(assetType);
        }
      }
    }
  }

  return Array.from(assetTypes);
}

/**
 * Map Cloud Asset type to high-level resource ID.
 */
export function cloudAssetToHighLevelType(cloudAssetType: string): string | null {
  // Reverse lookup
  for (const [pulumiType, assetType] of Object.entries(PULUMI_TO_CLOUD_ASSET)) {
    if (assetType === cloudAssetType) {
      // Find the high-level resource that uses this Pulumi type
      for (const resource of getAllHighLevelResources()) {
        for (const impl of resource.implementations) {
          if (impl.resource_type === pulumiType) {
            return resource.id;
          }
        }
      }
    }
  }
  return null;
}
