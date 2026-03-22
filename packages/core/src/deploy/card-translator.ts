/**
 * Card-to-Graph Translation Layer
 *
 * Transforms desktop CardNode[] + CardEdge[] into a core MutableGraph
 * with GCP-typed nodes that the deploy pipeline understands.
 */

import { MutableGraph, create_mutable_graph } from '../graph/mutable-graph.js';
import type { Graph, EdgeRelationship } from '../types/graph.js';

// =============================================================================
// Types
// =============================================================================

export type DeployProvider = 'gcp' | 'aws' | 'azure';
export type EnvironmentType = 'production' | 'staging' | 'development';

export interface CardTranslationInput {
  /** Card nodes from the desktop canvas */
  nodes: CardNodeInput[];
  /** Card edges from the desktop canvas */
  edges: CardEdgeInput[];
  /** Target cloud provider */
  provider: DeployProvider;
  /** Project name (used as graph name) */
  projectName: string;
  /** Target environment (affects resource sizing) */
  environment?: EnvironmentType;
  /** GCP project ID */
  gcpProject?: string;
  /** Default region */
  region?: string;
}

export interface CardNodeInput {
  id: string;
  type: 'block' | 'resource' | 'group';
  data: Record<string, unknown>;
}

export interface CardEdgeInput {
  id: string;
  source: string;
  target: string;
  data?: { relationship?: string; protocol?: string; port?: number; [key: string]: unknown };
}

export interface CardTranslationResult {
  /** The translated deployment graph */
  graph: Graph;
  /** Nodes that were skipped (groups, UI-only, external) */
  skipped: SkippedNode[];
  /** Warnings generated during translation */
  warnings: string[];
  /** Number of deployable nodes */
  deployable_count: number;
}

export interface SkippedNode {
  nodeId: string;
  label: string;
  reason: string;
}

// =============================================================================
// GCP iceType → deployer type mapping
// =============================================================================

const GCP_TYPE_MAP: Record<string, string> = {
  'Application.StaticSite': 'gcp.storage.bucket',
  'Application.SSRSite': 'gcp.run.service',
  'Application.Container': 'gcp.run.service',
  'Application.BackendAPI': 'gcp.run.service',
  'Application.Worker': 'gcp.run.job',
  'Application.CronJob': 'gcp.cloudscheduler.job',
  'Application.ServerlessFunction': 'gcp.cloudfunctions.function',
  'Database.PostgreSQL': 'gcp.sql.databaseInstance',
  'Database.MySQL': 'gcp.sql.databaseInstance',
  'Database.Firestore': 'gcp.firestore.database',
  'Database.Redis': 'gcp.redis.instance',
  'Storage.Bucket': 'gcp.storage.bucket',
  'Storage.ObjectStorage': 'gcp.storage.bucket',
  'Network.Gateway': 'gcp.apigateway.api',
  'Network.Internet': 'gcp.compute.globalForwardingRule',
  'Network.LoadBalancer': 'gcp.compute.globalForwardingRule',
  'Messaging.CloudPubSub': 'gcp.pubsub.topic',
  'Messaging.Queue': 'gcp.pubsub.topic',
  'Messaging.Topic': 'gcp.pubsub.topic',
  'Messaging.RabbitMQ': 'gcp.container.cluster',
  'Security.Identity': 'gcp.identityplatform.config',
  'Security.Secret': 'gcp.secretmanager.secret',
  'Monitoring.Log': 'gcp.logging.sink',
  'AI.VectorDB': 'gcp.aiplatform.index',
  'AI.LLMGateway': 'gcp.aiplatform.endpoint',
  'AI.ModelServing': 'gcp.aiplatform.endpoint',
  'Analytics.DataWarehouse': 'gcp.bigquery.dataset',
  'Analytics.Search': 'gcp.discoveryengine.searchEngine',
  'Networking.Domain': 'gcp.run.domainMapping',
};

// =============================================================================
// AWS iceType → deployer type mapping
// =============================================================================

const AWS_TYPE_MAP: Record<string, string> = {
  'Application.StaticSite': 'aws.s3.bucket',
  'Application.SSRSite': 'aws.ecs.service',
  'Application.Container': 'aws.ecs.service',
  'Application.BackendAPI': 'aws.ecs.service',
  'Application.Worker': 'aws.ecs.service',
  'Application.CronJob': 'aws.events.rule',
  'Application.ServerlessFunction': 'aws.lambda.function',
  'Database.PostgreSQL': 'aws.rds.dbInstance',
  'Database.MySQL': 'aws.rds.dbInstance',
  'Database.DynamoDB': 'aws.dynamodb.table',
  'Database.Redis': 'aws.elasticache.cluster',
  'Database.MongoDB': 'aws.docdb.cluster',
  'Storage.Bucket': 'aws.s3.bucket',
  'Storage.ObjectStorage': 'aws.s3.bucket',
  'Network.Gateway': 'aws.apigateway.restApi',
  'Network.Internet': 'aws.cloudfront.distribution',
  'Network.LoadBalancer': 'aws.elbv2.loadBalancer',
  'Messaging.Queue': 'aws.sqs.queue',
  'Messaging.Topic': 'aws.sns.topic',
  'Messaging.CloudPubSub': 'aws.sns.topic',
  'Security.Identity': 'aws.cognito.userPool',
  'Security.Secret': 'aws.secretsmanager.secret',
  'Monitoring.Log': 'aws.cloudwatch.logGroup',
  'AI.VectorDB': 'aws.opensearch.domain',
  'AI.LLMGateway': 'aws.bedrock.endpoint',
  'AI.ModelServing': 'aws.sagemaker.endpoint',
  'Analytics.DataWarehouse': 'aws.redshift.cluster',
};

// =============================================================================
// Azure iceType → deployer type mapping
// =============================================================================

const AZURE_TYPE_MAP: Record<string, string> = {
  'Application.StaticSite': 'azure.storage.staticSite',
  'Application.SSRSite': 'azure.appservice.webApp',
  'Application.Container': 'azure.containerapp.containerApp',
  'Application.BackendAPI': 'azure.appservice.webApp',
  'Application.Worker': 'azure.containerapp.containerApp',
  'Application.CronJob': 'azure.logicapp.workflow',
  'Application.ServerlessFunction': 'azure.functions.functionApp',
  'Database.PostgreSQL': 'azure.dbforpostgresql.server',
  'Database.MySQL': 'azure.dbformysql.server',
  'Database.CosmosDB': 'azure.cosmosdb.account',
  'Database.Redis': 'azure.cache.redis',
  'Database.MongoDB': 'azure.cosmosdb.account',
  'Storage.Bucket': 'azure.storage.storageAccount',
  'Storage.ObjectStorage': 'azure.storage.storageAccount',
  'Network.Gateway': 'azure.apimanagement.service',
  'Network.Internet': 'azure.cdn.profile',
  'Network.LoadBalancer': 'azure.network.loadBalancer',
  'Messaging.Queue': 'azure.servicebus.queue',
  'Messaging.Topic': 'azure.servicebus.topic',
  'Security.Identity': 'azure.activedirectory.application',
  'Security.Secret': 'azure.keyvault.vault',
  'Monitoring.Log': 'azure.monitor.logAnalyticsWorkspace',
  'AI.VectorDB': 'azure.search.searchService',
  'AI.LLMGateway': 'azure.openai.deployment',
  'AI.ModelServing': 'azure.machinelearning.endpoint',
  'Analytics.DataWarehouse': 'azure.synapse.workspace',
};

// iceTypes that are UI-only and should not be deployed
const UI_ONLY_TYPES = new Set(['Log.Terminal']);

// iceTypes that are external services (not GCP-managed)
const EXTERNAL_TYPES = new Set(['Database.MongoDB']);

// Providers that have no deployer support — blocks are design-only
const DESIGN_ONLY_PROVIDERS = new Set(['alibaba', 'digitalocean', 'kubernetes']);

// =============================================================================
// Property extractors per GCP service type
// =============================================================================

function extract_cloud_run_properties(
  data: Record<string, unknown>,
  region: string
): Record<string, unknown> {
  return {
    region,
    image: (data.image as string) || '',
    repository: (data.repository as string) || '',
    branch: (data.branch as string) || 'main',
    port: data.port || 8080,
    min_instances: data.minInstances ?? 0,
    max_instances: data.maxInstances ?? 3,
    cpu: data.cpu || '1',
    memory: data.memory || '512Mi',
    allow_unauthenticated: data.allowUnauthenticated ?? true,
    env_vars: data.envVars || {},
    labels: {},
  };
}

function extract_cloud_run_job_properties(
  data: Record<string, unknown>,
  region: string
): Record<string, unknown> {
  return {
    region,
    image: (data.image as string) || '',
    repository: (data.repository as string) || '',
    branch: (data.branch as string) || 'main',
    cpu: data.cpu || '1',
    memory: data.memory || '512Mi',
    max_retries: data.maxRetries ?? 3,
    timeout: data.timeout || '600s',
    env_vars: data.envVars || {},
    labels: {},
  };
}

function extract_cloud_sql_properties(
  data: Record<string, unknown>,
  region: string
): Record<string, unknown> {
  const ice_type = data.iceType as string;
  const is_postgres = ice_type === 'Database.PostgreSQL';
  const runtime = (data.runtime as string) || (is_postgres ? 'PostgreSQL 16' : 'MySQL 8.0');
  const version_match = runtime.match(/(\d+(\.\d+)?)/);
  const version_num = version_match?.[1] ?? (is_postgres ? '16' : '8.0');

  return {
    region,
    tier: data.size || 'db-f1-micro',
    database_version: is_postgres
      ? `POSTGRES_${version_num}`
      : `MYSQL_${version_num.replace('.', '_')}`,
    storage_size_gb: parse_storage_gb(data.storage as string) || 20,
    backup_enabled: true,
    port: data.port || (is_postgres ? 5432 : 3306),
    labels: {},
  };
}

function extract_cloud_functions_properties(
  data: Record<string, unknown>,
  region: string
): Record<string, unknown> {
  return {
    region,
    runtime: normalize_runtime(data.runtime as string) || 'nodejs20',
    memory_mb: data.memory || 256,
    timeout_seconds: data.timeout || 30,
    entry_point: data.entryPoint || 'handler',
    trigger_type: data.triggerType || 'http',
    env_vars: data.envVars || {},
    labels: {},
  };
}

function extract_cloud_scheduler_properties(
  data: Record<string, unknown>,
  region: string
): Record<string, unknown> {
  const schedule_map: Record<string, string> = {
    daily: '0 0 * * *',
    hourly: '0 * * * *',
    weekly: '0 0 * * 0',
    monthly: '0 0 1 * *',
  };
  const schedule = (data.schedule as string) || 'daily';

  return {
    region,
    schedule: schedule_map[schedule] || schedule,
    timezone: data.timezone || 'UTC',
    target_type: data.targetType || 'http',
    target_uri: data.targetUri || '',
    labels: {},
  };
}

function extract_storage_bucket_properties(
  data: Record<string, unknown>,
  region: string
): Record<string, unknown> {
  return {
    location: region.toUpperCase().split('-').slice(0, 1).join('') || 'US',
    storage_class: data.storageClass || 'STANDARD',
    versioning: data.versioning ?? false,
    labels: {},
  };
}

function extract_pubsub_properties(
  data: Record<string, unknown>,
  _region: string
): Record<string, unknown> {
  return {
    message_retention_duration: data.retentionDuration || '604800s',
    labels: {},
  };
}

function extract_firestore_properties(
  data: Record<string, unknown>,
  region: string
): Record<string, unknown> {
  return {
    location_id: region,
    type: data.databaseType || 'FIRESTORE_NATIVE',
    labels: {},
  };
}

function extract_memorystore_properties(
  data: Record<string, unknown>,
  region: string
): Record<string, unknown> {
  return {
    region,
    tier: data.tier || 'BASIC',
    memory_size_gb: data.memorySizeGb || 1,
    redis_version: data.redisVersion || 'REDIS_7_0',
    port: data.port || 6379,
    labels: {},
  };
}

function extract_secret_manager_properties(
  data: Record<string, unknown>,
  _region: string
): Record<string, unknown> {
  return {
    replication_type: data.replicationType || 'automatic',
    labels: {},
  };
}

function extract_identity_platform_properties(
  data: Record<string, unknown>,
  _region: string
): Record<string, unknown> {
  return {
    sign_in_providers: data.signInProviders || ['email', 'google'],
    mfa_enabled: data.mfaEnabled ?? false,
  };
}

function extract_bigquery_properties(
  data: Record<string, unknown>,
  region: string
): Record<string, unknown> {
  return {
    location: region,
    default_table_expiration_ms: data.tableExpirationMs,
    labels: {},
  };
}

function extract_api_gateway_properties(
  data: Record<string, unknown>,
  region: string
): Record<string, unknown> {
  return {
    region,
    labels: {},
  };
}

function extract_load_balancer_properties(
  data: Record<string, unknown>,
  _region: string
): Record<string, unknown> {
  return {
    scheme: 'EXTERNAL',
    port_range: data.port || '443',
    protocol: data.protocol || 'HTTPS',
    labels: {},
  };
}

function extract_logging_properties(
  data: Record<string, unknown>,
  _region: string
): Record<string, unknown> {
  return {
    filter: data.filter || '',
    destination_type: data.destinationType || 'logging.googleapis.com',
    labels: {},
  };
}

function extract_vertex_ai_properties(
  data: Record<string, unknown>,
  region: string
): Record<string, unknown> {
  return {
    region,
    display_name: data.label || 'vertex-endpoint',
    labels: {},
  };
}

function extract_dataflow_properties(
  data: Record<string, unknown>,
  region: string
): Record<string, unknown> {
  return {
    region,
    template_type: data.templateType || 'streaming',
    labels: {},
  };
}

function extract_discovery_engine_properties(
  data: Record<string, unknown>,
  region: string
): Record<string, unknown> {
  return {
    location: region,
    solution_type: 'SOLUTION_TYPE_SEARCH',
    labels: {},
  };
}

function extract_gke_properties(
  data: Record<string, unknown>,
  region: string
): Record<string, unknown> {
  return {
    location: region,
    initial_node_count: data.nodeCount || 3,
    machine_type: data.machineType || 'e2-standard-2',
    labels: {},
  };
}

function extract_domain_mapping_properties(
  data: Record<string, unknown>,
  region: string
): Record<string, unknown> {
  return {
    domain: [data.subdomain, data.hostname].filter(Boolean).join('.') || (data.hostname as string) || '',
    hostname: (data.hostname as string) || '',
    subdomain: (data.subdomain as string) || '',
    ssl_mode: (data.sslMode as string) || 'auto',
    region,
    labels: {},
  };
}

// =============================================================================
// Property extraction dispatcher
// =============================================================================

const PROPERTY_EXTRACTORS: Record<
  string,
  (data: Record<string, unknown>, region: string) => Record<string, unknown>
> = {
  'gcp.run.service': extract_cloud_run_properties,
  'gcp.run.job': extract_cloud_run_job_properties,
  'gcp.sql.databaseInstance': extract_cloud_sql_properties,
  'gcp.cloudfunctions.function': extract_cloud_functions_properties,
  'gcp.cloudscheduler.job': extract_cloud_scheduler_properties,
  'gcp.storage.bucket': extract_storage_bucket_properties,
  'gcp.pubsub.topic': extract_pubsub_properties,
  'gcp.firestore.database': extract_firestore_properties,
  'gcp.redis.instance': extract_memorystore_properties,
  'gcp.secretmanager.secret': extract_secret_manager_properties,
  'gcp.identityplatform.config': extract_identity_platform_properties,
  'gcp.bigquery.dataset': extract_bigquery_properties,
  'gcp.apigateway.api': extract_api_gateway_properties,
  'gcp.compute.globalForwardingRule': extract_load_balancer_properties,
  'gcp.logging.sink': extract_logging_properties,
  'gcp.aiplatform.endpoint': extract_vertex_ai_properties,
  'gcp.aiplatform.index': extract_vertex_ai_properties,
  'gcp.dataflow.job': extract_dataflow_properties,
  'gcp.discoveryengine.searchEngine': extract_discovery_engine_properties,
  'gcp.container.cluster': extract_gke_properties,
  'gcp.run.domainMapping': extract_domain_mapping_properties,
};

// =============================================================================
// Main translation function
// =============================================================================

/**
 * Translate desktop CardNode[] + CardEdge[] into a deployable Graph.
 *
 * Filters out groups and UI-only nodes, maps iceTypes to GCP API types,
 * extracts deployment properties from card data, and creates edges
 * for dependency ordering.
 */
export function translate_card_to_graph(input: CardTranslationInput): CardTranslationResult {
  const { nodes, edges, provider, projectName, region = 'us-central1' } = input;

  const warnings: string[] = [];
  const skipped: SkippedNode[] = [];

  // ENGINE-3: Warn if provider has no deployer support
  if (DESIGN_ONLY_PROVIDERS.has(provider)) {
    warnings.push(
      `Provider "${provider}" is design-only — deployment is not yet supported. ` +
      `Blocks can be used for architecture planning but will not be provisioned.`
    );
  }

  // Build the type map for the target provider
  const type_map = get_type_map(provider);

  // Create the mutable graph
  const graph = create_mutable_graph(projectName, {
    description: `Deployment graph for ${projectName}`,
    providers: [provider],
    regions: [region],
  });

  // Track card node ID → graph node name mapping for edge translation
  const card_id_to_name = new Map<string, string>();
  let deployable_count = 0;

  // Pass 1: Add deployable nodes
  for (const node of nodes) {
    // Skip group nodes — they're organizational, not deployable
    if (node.type === 'group') {
      skipped.push({
        nodeId: node.id,
        label: (node.data.label as string) || node.id,
        reason: 'Group nodes are organizational and not deployed',
      });
      continue;
    }

    const ice_type = node.data.iceType as string;
    if (!ice_type) {
      skipped.push({
        nodeId: node.id,
        label: (node.data.label as string) || node.id,
        reason: 'No iceType defined on node',
      });
      continue;
    }

    // Skip UI-only types
    if (UI_ONLY_TYPES.has(ice_type)) {
      skipped.push({
        nodeId: node.id,
        label: (node.data.label as string) || node.id,
        reason: `UI-only type: ${ice_type}`,
      });
      continue;
    }

    // Skip external types
    if (EXTERNAL_TYPES.has(ice_type)) {
      skipped.push({
        nodeId: node.id,
        label: (node.data.label as string) || node.id,
        reason: `External service not managed by ${provider}: ${ice_type}`,
      });
      continue;
    }

    // Look up the deployer type
    const gcp_type = type_map[ice_type];
    if (!gcp_type) {
      warnings.push(
        `No ${provider} mapping for iceType "${ice_type}" (node: ${node.data.label || node.id}). Skipped.`
      );
      skipped.push({
        nodeId: node.id,
        label: (node.data.label as string) || node.id,
        reason: `No ${provider} deployer mapping for ${ice_type}`,
      });
      continue;
    }

    // Extract deployment properties
    const extractor = PROPERTY_EXTRACTORS[gcp_type];
    const properties = extractor ? extractor(node.data, region) : { region, labels: {} };

    // Generate a unique, sanitized name
    const label = (node.data.label as string) || ice_type.split('.').pop() || 'resource';
    const name = sanitize_name(`${label}-${node.id.slice(-6)}`);

    // Add node to graph
    const result = graph.add_node({
      type: gcp_type,
      name,
      properties,
      labels: {
        'ice-source-id': node.id,
        'ice-type': ice_type,
        'ice-project': projectName,
      },
    });

    if (result.success) {
      card_id_to_name.set(node.id, name);
      deployable_count++;
    } else {
      // Name collision — try with full ID suffix
      const alt_name = sanitize_name(`${label}-${node.id.slice(-12)}`);
      const alt_result = graph.add_node({
        type: gcp_type,
        name: alt_name,
        properties,
        labels: {
          'ice-source-id': node.id,
          'ice-type': ice_type,
          'ice-project': projectName,
        },
      });
      if (alt_result.success) {
        card_id_to_name.set(node.id, alt_name);
        deployable_count++;
      } else {
        warnings.push(`Failed to add node "${label}": ${alt_result.errors?.join(', ')}`);
      }
    }
  }

  // Pass 2: Add edges between deployed nodes
  for (const edge of edges) {
    const source_name = card_id_to_name.get(edge.source);
    const target_name = card_id_to_name.get(edge.target);

    // Skip edges where either end was not deployed
    if (!source_name || !target_name) continue;

    const relationship = map_edge_relationship(edge.data?.relationship);

    graph.add_edge({
      source: source_name,
      target: target_name,
      relationship,
    });
  }

  return {
    graph: graph as Graph,
    skipped,
    warnings,
    deployable_count,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function get_type_map(provider: DeployProvider): Record<string, string> {
  switch (provider) {
    case 'gcp':
      return GCP_TYPE_MAP;
    case 'aws':
      return AWS_TYPE_MAP;
    case 'azure':
      return AZURE_TYPE_MAP;
    default:
      return {};
  }
}

function map_edge_relationship(relationship?: string): EdgeRelationship {
  switch (relationship) {
    case 'depends_on':
      return 'depends_on';
    case 'contains':
      return 'contains';
    case 'references':
      return 'references';
    case 'connects_to':
      return 'connects_to';
    case 'talks_to':
      return 'talks_to';
    default:
      return 'connects_to';
  }
}

/**
 * Sanitize a name to be a valid GCP resource name.
 * GCP names: lowercase letters, digits, hyphens. Max 63 chars.
 */
function sanitize_name(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63);
}

/**
 * Parse a storage size string like "50 GB" to a number of GB.
 */
function parse_storage_gb(storage?: string): number | undefined {
  if (!storage) return undefined;
  const match = storage.match(/(\d+)\s*(GB|TB|MB)/i);
  if (!match || !match[1] || !match[2]) return undefined;
  const value = parseInt(match[1], 10);
  const unit = match[2].toUpperCase();
  if (unit === 'TB') return value * 1024;
  if (unit === 'MB') return Math.max(1, Math.round(value / 1024));
  return value;
}

/**
 * Normalize a runtime string like "Node.js 20" → "nodejs20".
 */
function normalize_runtime(runtime?: string): string | undefined {
  if (!runtime) return undefined;
  const lower = runtime.toLowerCase();
  if (lower.includes('node')) {
    const ver = lower.match(/(\d+)/)?.[1] ?? '20';
    return `nodejs${ver}`;
  }
  if (lower.includes('python')) {
    const ver = lower.match(/(\d+\.?\d*)/)?.[1] ?? '3.12';
    return `python${ver.replace('.', '')}`;
  }
  if (lower.includes('go')) {
    const ver = lower.match(/(\d+\.?\d*)/)?.[1] ?? '1.21';
    return `go${ver.replace('.', '')}`;
  }
  if (lower.includes('java')) {
    const ver = lower.match(/(\d+)/)?.[1] ?? '17';
    return `java${ver}`;
  }
  return runtime.toLowerCase().replace(/[^a-z0-9]/g, '');
}
