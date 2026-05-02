/**
 * GCP Type Mapper
 *
 * Maps GCP resource kinds to ICE high-level types.
 * Uses the same type format as sample-microservice.ice.json:
 *   Network.VPC, Database.PostgreSQL, Application.Container, etc.
 */

import type { NodeBehavior } from '../../resources/high-level-resources.js';

// =============================================================================
// Kind to High-Level ICE Type Mapping
// =============================================================================

/**
 * Resource type info including behavior and category
 */
interface TypeInfo {
  ice_type: string; // High-level type like "Network.VPC"
  behavior: NodeBehavior;
}

/**
 * Mapping from GCP resource kinds to high-level ICE types.
 * Uses Category.SubType format matching the sample graph.
 */
const KIND_MAP: Record<string, TypeInfo> = {
  // ==========================================================================
  // Networking
  // ==========================================================================
  'compute#network': { ice_type: 'Network.VPC', behavior: 'container' },
  'compute#subnetwork': { ice_type: 'Network.Subnet', behavior: 'container' },
  'compute#forwardingrule': { ice_type: 'Network.LoadBalancer', behavior: 'connector' },
  'compute#globalforwardingrule': { ice_type: 'Network.CDN', behavior: 'connector' },
  'compute#urlmap': { ice_type: 'Network.LoadBalancer', behavior: 'connector' },
  'compute#backendservice': { ice_type: 'Network.LoadBalancer', behavior: 'connector' },
  'dns#managedzone': { ice_type: 'Network.DNS', behavior: 'singleton' },
  'apigateway#gateway': { ice_type: 'Compute.API', behavior: 'connector' },

  // ==========================================================================
  // Application / Compute
  // ==========================================================================
  'run#service': { ice_type: 'Compute.Container', behavior: 'scalable' },
  'run#job': { ice_type: 'Compute.Worker', behavior: 'scalable' },
  'cloudfunctions#function': { ice_type: 'Compute.Function', behavior: 'scalable' },
  'cloudfunctions#cloudfunction': { ice_type: 'Compute.Function', behavior: 'scalable' },
  'appengine#service': { ice_type: 'Compute.Container', behavior: 'scalable' },
  'container#cluster': { ice_type: 'Compute.Container', behavior: 'scalable' },
  'compute#instance': { ice_type: 'Compute.Container', behavior: 'scalable' },
  'compute#instancegroup': { ice_type: 'Compute.Container', behavior: 'scalable' },

  // ==========================================================================
  // Database
  // ==========================================================================
  'sqladmin#instance': { ice_type: 'Database.PostgreSQL', behavior: 'stateful' }, // Could be MySQL too
  'sql#instance': { ice_type: 'Database.PostgreSQL', behavior: 'stateful' },
  'spanner#instance': { ice_type: 'Database.PostgreSQL', behavior: 'stateful' },
  'redis#instance': { ice_type: 'Database.Redis', behavior: 'stateful' },
  'firestore#database': { ice_type: 'Database.NoSQL', behavior: 'stateful' },
  'bigquery#dataset': { ice_type: 'Database.DataWarehouse', behavior: 'stateful' },

  // ==========================================================================
  // Storage
  // ==========================================================================
  'storage#bucket': { ice_type: 'Storage.Bucket', behavior: 'stateful' },
  'filestore#instance': { ice_type: 'Storage.FileSystem', behavior: 'stateful' },

  // ==========================================================================
  // Messaging
  // ==========================================================================
  'pubsub#topic': { ice_type: 'Messaging.EventBus', behavior: 'streaming' },
  'pubsub#subscription': { ice_type: 'Messaging.Queue', behavior: 'streaming' },
  'cloudtasks#queue': { ice_type: 'Messaging.Queue', behavior: 'streaming' },

  // ==========================================================================
  // Security
  // ==========================================================================
  'secretmanager#secret': { ice_type: 'Security.Secret', behavior: 'singleton' },
  'iam#serviceaccount': { ice_type: 'Security.Identity', behavior: 'singleton' },
  'compute#sslcertificate': { ice_type: 'Security.Certificate', behavior: 'singleton' },
  'cloudkms#keyring': { ice_type: 'Security.Key', behavior: 'singleton' },
  'cloudkms#cryptokey': { ice_type: 'Security.Key', behavior: 'singleton' },

  // ==========================================================================
  // Monitoring
  // ==========================================================================
  'logging#logsink': { ice_type: 'Monitoring.LogGroup', behavior: 'streaming' },
  'monitoring#alertpolicy': { ice_type: 'Monitoring.Alert', behavior: 'singleton' },
  'monitoring#dashboard': { ice_type: 'Monitoring.Dashboard', behavior: 'singleton' },

  // ==========================================================================
  // Jobs / Scheduled Tasks
  // ==========================================================================
  'cloudscheduler#job': { ice_type: 'Compute.CronJob', behavior: 'singleton' },
};

/**
 * Fallback mapping for kinds not in the map - uses low-level type
 */
const FALLBACK_KIND_MAP: Record<string, string> = {
  // Infrastructure that maps to low-level types
  'compute#disk': 'gcp.compute.disk',
  'compute#image': 'gcp.compute.image',
  'compute#snapshot': 'gcp.compute.snapshot',
  'compute#instancetemplate': 'gcp.compute.instance_template',
  'compute#instancegroupmanager': 'gcp.compute.instance_group_manager',
  'compute#autoscaler': 'gcp.compute.autoscaler',
  'compute#firewall': 'gcp.compute.firewall',
  'compute#router': 'gcp.compute.router',
  'compute#route': 'gcp.compute.route',
  'compute#address': 'gcp.compute.address',
  'compute#globaladdress': 'gcp.compute.global_address',
  'compute#targetpool': 'gcp.compute.target_pool',
  'compute#targethttpproxy': 'gcp.compute.target_http_proxy',
  'compute#targethttpsproxy': 'gcp.compute.target_https_proxy',
  'compute#backendbucket': 'gcp.compute.backend_bucket',
  'compute#healthcheck': 'gcp.compute.health_check',
  'sql#database': 'gcp.sql.database',
  'sqladmin#database': 'gcp.sql.database',
  'sql#user': 'gcp.sql.user',
  'container#nodepool': 'gcp.container.node_pool',
  'run#revision': 'gcp.run.revision',
  'iam#serviceaccountkey': 'gcp.iam.service_account_key',
  'iam#role': 'gcp.iam.role',
  'pubsub#schema': 'gcp.pubsub.schema',
  'bigquery#table': 'gcp.bigquery.table',
  'secretmanager#secretversion': 'gcp.secretmanager.secret_version',
  'artifactregistry#repository': 'gcp.artifactregistry.repository',
  'dns#resourcerecordset': 'gcp.dns.record_set',
  'spanner#database': 'gcp.spanner.database',
  'appengine#version': 'gcp.appengine.version',
  'vpcaccess#connector': 'gcp.vpcaccess.connector',
  'cloudbuild#trigger': 'gcp.cloudbuild.trigger',
  'logging#logmetric': 'gcp.logging.metric',
  'monitoring#notificationchannel': 'gcp.monitoring.notification_channel',
};

/**
 * Get the ICE type for a GCP resource kind.
 * Returns high-level types like "Network.VPC", "Database.PostgreSQL", etc.
 */
export function get_ice_type(gcp_kind: string): string {
  // Check high-level mapping first
  const mapped = KIND_MAP[gcp_kind];
  if (mapped) {
    return mapped.ice_type;
  }

  // Check fallback low-level mapping
  const fallback = FALLBACK_KIND_MAP[gcp_kind];
  if (fallback) {
    return fallback;
  }

  // Generate low-level type for unknown kinds
  // e.g., "compute#instance" -> "gcp.compute.instance"
  const parts = gcp_kind.split('#');
  if (parts.length === 2) {
    const service = parts[0]!.toLowerCase();
    const resource = parts[1]!
      .toLowerCase()
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase();
    return `gcp.${service}.${resource}`;
  }

  return `gcp.unknown.${gcp_kind.replace('#', '_').toLowerCase()}`;
}

/**
 * Get the behavior for a GCP resource kind.
 * Returns undefined for unmapped types.
 */
export function get_behavior(gcp_kind: string): NodeBehavior | undefined {
  const mapped = KIND_MAP[gcp_kind];
  return mapped?.behavior;
}

/**
 * Get full type info for a GCP resource kind.
 */
export function get_type_info(gcp_kind: string): { ice_type: string; behavior?: NodeBehavior } {
  const mapped = KIND_MAP[gcp_kind];
  if (mapped) {
    return mapped;
  }

  // Fallback - return just ice_type without behavior
  return {
    ice_type: get_ice_type(gcp_kind),
    behavior: undefined,
  };
}

/**
 * Check if a GCP kind is supported (has explicit mapping).
 */
export function is_kind_supported(gcp_kind: string): boolean {
  return gcp_kind in KIND_MAP;
}

/**
 * Get all supported GCP kinds.
 */
export function get_supported_kinds(): string[] {
  return Object.keys(KIND_MAP);
}

// =============================================================================
// Property Mapping
// =============================================================================

/**
 * Properties to keep for each resource type.
 * Only includes user-relevant properties, skips internal/metadata fields.
 */
const CLEAN_PROPERTY_EXTRACTORS: Record<string, (props: Record<string, unknown>) => Record<string, unknown>> = {
  // VPC Network
  'compute#network': (props) => ({
    name: props.name,
    auto_create_subnetworks: props.autoCreateSubnetworks,
    routing_mode: (props.routingConfig as any)?.routingMode,
    mtu: props.mtu,
  }),

  // Subnet
  'compute#subnetwork': (props) => ({
    name: props.name,
    cidr_block: props.ipCidrRange,
    region: extractRegion(props.region as string),
    private_ip_google_access: props.privateIpGoogleAccess,
    secondary_ip_ranges: (props.secondaryIpRanges as any[])?.map((r: any) => r.ipCidrRange),
  }),

  // Cloud Run
  'run#service': (props) => {
    const template = (props.template as any) || {};
    const containers = template.containers || template.spec?.containers || [];
    const container = containers[0] || {};
    return {
      name: props.name || (props.metadata as any)?.name,
      image: container.image,
      port: container.ports?.[0]?.containerPort,
      memory: container.resources?.limits?.memory,
      cpu: container.resources?.limits?.cpu,
      concurrency: template.maxInstanceRequestConcurrency,
      min_instances: template.scaling?.minInstanceCount,
      max_instances: template.scaling?.maxInstanceCount,
    };
  },

  // Cloud Functions
  'cloudfunctions#function': (props) => ({
    name: props.name,
    runtime: props.runtime,
    entry_point: props.entryPoint,
    memory: props.availableMemoryMb,
    timeout: props.timeout,
    trigger: props.httpsTrigger ? 'HTTP' : props.eventTrigger ? 'Event' : 'Unknown',
  }),
  'cloudfunctions#cloudfunction': (props) => ({
    name: props.name,
    runtime: props.runtime,
    entry_point: props.entryPoint,
    memory: props.availableMemoryMb,
    timeout: props.timeout,
    trigger: props.httpsTrigger ? 'HTTP' : props.eventTrigger ? 'Event' : 'Unknown',
  }),

  // Cloud SQL
  'sqladmin#instance': (props) => {
    const settings = (props.settings as any) || {};
    return {
      name: props.name,
      version: props.databaseVersion,
      tier: settings.tier,
      storage_gb: settings.dataDiskSizeGb,
      storage_type: settings.dataDiskType,
      high_availability: settings.availabilityType === 'REGIONAL',
      backup_enabled: settings.backupConfiguration?.enabled,
    };
  },
  'sql#instance': (props) => CLEAN_PROPERTY_EXTRACTORS['sqladmin#instance']!(props),

  // Storage Bucket
  'storage#bucket': (props) => ({
    name: props.name,
    location: props.location,
    storage_class: props.storageClass,
    versioning: (props.versioning as any)?.enabled,
    public_access: !(props.iamConfiguration as any)?.uniformBucketLevelAccess?.enabled,
    lifecycle_days: (props.lifecycle as any)?.rule?.[0]?.condition?.age,
  }),

  // Pub/Sub Topic
  'pubsub#topic': (props) => ({
    // findings.md #26 — `props.name || extractName(props.name)` was a
    // dead-eyed fallback: pubsub returns `name` as the fully-qualified
    // path `projects/<proj>/topics/<topic>`, so the OR-arm always took
    // the path verbatim. Always extract the bare name; works for both
    // shapes since `extractName('mytopic')` is itself 'mytopic'.
    name: extractName(props.name as string | undefined),
    message_retention: props.messageRetentionDuration,
  }),

  // Pub/Sub Subscription
  'pubsub#subscription': (props) => ({
    name: extractName(props.name as string | undefined),
    topic: extractName((props.topic as string) || ''),
    ack_deadline: props.ackDeadlineSeconds,
    message_retention: props.messageRetentionDuration,
    push_endpoint: (props.pushConfig as any)?.pushEndpoint,
  }),

  // Secret Manager
  'secretmanager#secret': (props) => ({
    name: extractName(props.name as string | undefined),
    replication: (props.replication as any)?.automatic ? 'automatic' : 'manual',
  }),

  // Redis
  'redis#instance': (props) => ({
    name: props.name,
    tier: props.tier,
    memory_size_gb: props.memorySizeGb,
    version: props.redisVersion,
    host: props.host,
    port: props.port,
  }),

  // GKE Cluster
  'container#cluster': (props) => ({
    name: props.name,
    location: props.location,
    node_count: props.currentNodeCount || props.initialNodeCount,
    machine_type: (props.nodeConfig as any)?.machineType,
    kubernetes_version: props.currentMasterVersion,
    network: extractName((props.network as string) || ''),
  }),

  // DNS Zone
  'dns#managedzone': (props) => ({
    name: props.name,
    dns_name: props.dnsName,
    visibility: props.visibility,
  }),

  // Service Account
  'iam#serviceaccount': (props) => ({
    name: props.displayName || props.name,
    email: props.email,
    description: props.description,
  }),

  // Cloud Scheduler Job
  'cloudscheduler#job': (props) => ({
    name: props.name,
    schedule: props.schedule,
    timezone: props.timeZone,
    target_type: props.httpTarget ? 'HTTP' : props.pubsubTarget ? 'Pub/Sub' : 'Unknown',
  }),

  // Monitoring Alert
  'monitoring#alertpolicy': (props) => ({
    name: props.displayName || props.name,
    enabled: props.enabled,
    conditions: (props.conditions as any[])?.length || 0,
  }),

  // BigQuery Dataset
  'bigquery#dataset': (props) => ({
    name: (props.datasetReference as any)?.datasetId || props.friendlyName,
    location: props.location,
    description: props.description,
  }),
};

/**
 * Extract region from a full URL path
 */
function extractRegion(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const match = path.match(/regions\/([^/]+)/);
  return match ? match[1] : undefined;
}

/**
 * Extract resource name from a full path
 */
function extractName(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const parts = path.split('/');
  return parts[parts.length - 1];
}

/**
 * Map GCP properties to clean ICE properties.
 * Uses extractors for high-level types, falls back to snake_case conversion.
 */
export function map_properties(gcp_kind: string, properties: Record<string, unknown>): Record<string, unknown> {
  // Use clean property extractor if available
  const extractor = CLEAN_PROPERTY_EXTRACTORS[gcp_kind];
  if (extractor) {
    const clean = extractor(properties);
    // Filter out undefined values
    return Object.fromEntries(Object.entries(clean).filter(([_, v]) => v !== undefined && v !== null));
  }

  // Fallback: simple camelCase to snake_case conversion
  const result: Record<string, unknown> = {};

  for (const [gcp_key, value] of Object.entries(properties)) {
    // Skip internal fields
    if (gcp_key.startsWith('_') || gcp_key === 'kind' || gcp_key === 'etag' || gcp_key === 'selfLink') {
      continue;
    }

    // Convert camelCase to snake_case
    let ice_key = gcp_key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (ice_key.startsWith('_')) {
      ice_key = ice_key.slice(1);
    }

    result[ice_key] = value;
  }

  return result;
}
