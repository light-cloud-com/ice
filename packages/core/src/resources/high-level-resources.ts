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
import { storage } from './high-level-resources/categories/storage.js';
import { networking } from './high-level-resources/categories/networking.js';
import { messaging } from './high-level-resources/categories/messaging.js';

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
  storage,
  networking,
  messaging,
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
