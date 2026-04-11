/**
 * Card-to-Graph Translation Layer
 *
 * Transforms desktop CardNode[] + CardEdge[] into a core MutableGraph
 * with GCP-typed nodes that the deploy pipeline understands.
 */

import { createHash } from 'crypto';
import { create_mutable_graph } from '../graph/mutable-graph.js';
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
  /**
   * Phase 1 — optional map of `canvas node id → existing resource name`.
   *
   * When provided, nodes with an existing name reuse it verbatim instead of
   * generating a new one. This is what survives label renames and canvas
   * moves: the deploy service loads the mapping from `DeployedResourceMapping`
   * and hands it in here, so the translator produces the same graph shape
   * across runs.
   *
   * Novel nodes (not in the map) get a deterministic hash-based name that
   * is independent of the user-facing label.
   */
  existing_names?: Map<string, string>;
  /** Phase 1 — source card id, used for standard GCP resource labels. */
  cardId?: string;
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

export interface DeployableNodeInfo {
  /** Source canvas node id */
  node_id: string;
  /** Source canvas label (what the user sees) */
  label: string;
  /** iceType from the canvas node */
  ice_type: string;
  /** Concrete provider resource type (e.g. gcp.storage.bucket) */
  resource_type: string;
  /** Generated, sanitized resource name (matches what the deployer creates) */
  resource_name: string;
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
  /** One entry per deployable node — used by the service to build a plan and to
   *  reliably map deploy results back to canvas nodes. */
  deployables: DeployableNodeInfo[];
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
  // Firebase Hosting is the right answer for static sites on GCP. It
  // bypasses the Cloud Storage org policies (`iam.allowedPolicyMemberDomains`,
  // `storage.uniformBucketLevelAccess`, `storage.publicAccessPrevention`)
  // that make a public Cloud Storage bucket impossible in hardened
  // enterprise projects, AND it gives you free HTTPS, CDN, and a public
  // URL out of the box without provisioning a load balancer + backend
  // bucket + URL map + forwarding rule + managed cert.
  'Compute.StaticSite': 'gcp.firebase.hosting',
  'Compute.SSRSite': 'gcp.run.service',
  'Compute.Container': 'gcp.run.service',
  'Compute.BackendAPI': 'gcp.run.service',
  'Compute.Worker': 'gcp.run.job',
  'Compute.CronJob': 'gcp.cloudscheduler.job',
  'Compute.ServerlessFunction': 'gcp.cloudfunctions.function',
  'Database.PostgreSQL': 'gcp.sql.databaseInstance',
  'Database.MySQL': 'gcp.sql.databaseInstance',
  'Database.Firestore': 'gcp.firestore.database',
  'Database.Redis': 'gcp.redis.instance',
  'Storage.Bucket': 'gcp.storage.bucket',
  'Storage.ObjectStorage': 'gcp.storage.bucket',
  'Network.Gateway': 'gcp.apigateway.api',
  // `Network.PublicEndpoint` is the single "make my services reachable
  // from the internet" block. It compiles to a global forwarding rule
  // (which the handler expands into backend bucket + URL map + target
  // HTTPS proxy + forwarding rule). The managed SSL cert is injected
  // by the Pass 1.5 semantic wiring below when `enableHttps + domain`
  // are set, and the URL map host rules are populated from each
  // outgoing edge's `subdomain` field.
  'Network.PublicEndpoint': 'gcp.compute.globalForwardingRule',
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
};

// =============================================================================
// AWS iceType → deployer type mapping
// =============================================================================

const AWS_TYPE_MAP: Record<string, string> = {
  'Compute.StaticSite': 'aws.s3.bucket',
  'Compute.SSRSite': 'aws.ecs.service',
  'Compute.Container': 'aws.ecs.service',
  'Compute.BackendAPI': 'aws.ecs.service',
  'Compute.Worker': 'aws.ecs.service',
  'Compute.CronJob': 'aws.events.rule',
  'Compute.ServerlessFunction': 'aws.lambda.function',
  'Database.PostgreSQL': 'aws.rds.dbInstance',
  'Database.MySQL': 'aws.rds.dbInstance',
  'Database.DynamoDB': 'aws.dynamodb.table',
  'Database.Redis': 'aws.elasticache.cluster',
  'Database.MongoDB': 'aws.docdb.cluster',
  'Storage.Bucket': 'aws.s3.bucket',
  'Storage.ObjectStorage': 'aws.s3.bucket',
  'Network.Gateway': 'aws.apigateway.restApi',
  'Network.PublicEndpoint': 'aws.cloudfront.distribution',
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
  'Compute.StaticSite': 'azure.storage.staticSite',
  'Compute.SSRSite': 'azure.appservice.webApp',
  'Compute.Container': 'azure.containerapp.containerApp',
  'Compute.BackendAPI': 'azure.appservice.webApp',
  'Compute.Worker': 'azure.containerapp.containerApp',
  'Compute.CronJob': 'azure.logicapp.workflow',
  'Compute.ServerlessFunction': 'azure.functions.functionApp',
  'Database.PostgreSQL': 'azure.dbforpostgresql.server',
  'Database.MySQL': 'azure.dbformysql.server',
  'Database.CosmosDB': 'azure.cosmosdb.account',
  'Database.Redis': 'azure.cache.redis',
  'Database.MongoDB': 'azure.cosmosdb.account',
  'Storage.Bucket': 'azure.storage.storageAccount',
  'Storage.ObjectStorage': 'azure.storage.storageAccount',
  'Network.Gateway': 'azure.apimanagement.service',
  'Network.PublicEndpoint': 'azure.cdn.profile',
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
// Non-deployable canvas annotations. These blocks live on the canvas to
// document intent or wire source/config relationships visually but never
// compile to a cloud resource. Matches the special-case list in
// `packages/core/src/validation/deploy-rules.ts:173` and
// `packages/core/src/validation/schema-bridge.ts:71` so all three layers
// agree on what counts as a deployable node.
const UI_ONLY_TYPES = new Set([
  'Monitoring.Terminal',
  'Source.Repository',
  'Config.Environment',
  // Network.CustomDomain is metadata-only on the canvas: it carries a
  // root domain + per-edge subdomains and is consumed by Pass 1.45 to
  // propagate the full host onto each connected target's `domain`
  // property. Provider handlers (Firebase Hosting in particular) then
  // register the custom domain through their native API. There's no
  // dedicated DNS resource to deploy.
  'Network.CustomDomain',
]);

// iceTypes that are external services (not GCP-managed)
const EXTERNAL_TYPES = new Set(['Database.MongoDB']);

// Providers that have no deployer support — blocks are design-only
const DESIGN_ONLY_PROVIDERS = new Set(['alibaba', 'digitalocean', 'kubernetes']);

// =============================================================================
// Property extractors per GCP service type
// =============================================================================

function extract_cloud_run_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
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

function extract_cloud_run_job_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
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

function extract_cloud_sql_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  const ice_type = data.iceType as string;
  const is_postgres = ice_type === 'Database.PostgreSQL';
  const runtime = (data.runtime as string) || (is_postgres ? 'PostgreSQL 16' : 'MySQL 8.0');
  const version_match = runtime.match(/(\d+(\.\d+)?)/);
  const version_num = version_match?.[1] ?? (is_postgres ? '16' : '8.0');

  return {
    region,
    tier: data.size || 'db-f1-micro',
    database_version: is_postgres ? `POSTGRES_${version_num}` : `MYSQL_${version_num.replace('.', '_')}`,
    storage_size_gb: parse_storage_gb(data.storage as string) || 20,
    backup_enabled: true,
    port: data.port || (is_postgres ? 5432 : 3306),
    labels: {},
  };
}

function extract_cloud_functions_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
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

function extract_cloud_scheduler_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
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

function extract_storage_bucket_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  // Phase 8 — when the bucket backs a Compute.StaticSite block we need the
  // handler to make it publicly readable and enable static website hosting
  // (index.html / 404.html) so the load balancer's backend bucket can serve
  // it to the internet. Users who drag a plain Storage.Bucket block don't
  // get this treatment — private bucket, no website config.
  const iceType = String(data.iceType || '');
  const isStaticSite = iceType === 'Compute.StaticSite';
  return {
    location: region.toUpperCase().split('-').slice(0, 1).join('') || 'US',
    storage_class: data.storageClass || 'STANDARD',
    versioning: data.versioning ?? false,
    public_access: isStaticSite || data.public_access === true,
    website_hosting: isStaticSite || data.website_hosting === true,
    index_page: (data.index_page as string) || 'index.html',
    not_found_page: (data.not_found_page as string) || '404.html',
    labels: {},
  };
}

function extract_pubsub_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  return {
    message_retention_duration: data.retentionDuration || '604800s',
    labels: {},
  };
}

function extract_firestore_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    location_id: region,
    type: data.databaseType || 'FIRESTORE_NATIVE',
    labels: {},
  };
}

function extract_memorystore_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    region,
    tier: data.tier || 'BASIC',
    memory_size_gb: data.memorySizeGb || 1,
    redis_version: data.redisVersion || 'REDIS_7_0',
    port: data.port || 6379,
    labels: {},
  };
}

function extract_secret_manager_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  return {
    replication_type: data.replicationType || 'automatic',
    labels: {},
  };
}

function extract_identity_platform_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  return {
    sign_in_providers: data.signInProviders || ['email', 'google'],
    mfa_enabled: data.mfaEnabled ?? false,
  };
}

function extract_bigquery_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    location: region,
    default_table_expiration_ms: data.tableExpirationMs,
    labels: {},
  };
}

function extract_api_gateway_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    region,
    labels: {},
  };
}

function extract_load_balancer_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  const ssl_certificate = (data.sslCertificate as string | undefined) || (data.ssl_certificate as string | undefined);
  const explicit_protocol = (data.protocol as string | undefined)?.toUpperCase();
  const has_cert = Boolean(ssl_certificate);
  const protocol = explicit_protocol === 'HTTPS' || explicit_protocol === 'HTTP'
    ? explicit_protocol
    : has_cert ? 'HTTPS' : 'HTTP';
  return {
    scheme: 'EXTERNAL',
    port_range: data.port || (protocol === 'HTTPS' ? '443' : '80'),
    protocol,
    ssl_certificate,
    labels: {},
  };
}

function extract_logging_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  return {
    filter: data.filter || '',
    destination_type: data.destinationType || 'logging.googleapis.com',
    labels: {},
  };
}

function extract_vertex_ai_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    region,
    display_name: data.label || 'vertex-endpoint',
    labels: {},
  };
}

function extract_dataflow_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    region,
    template_type: data.templateType || 'streaming',
    labels: {},
  };
}

function extract_discovery_engine_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    location: region,
    solution_type: 'SOLUTION_TYPE_SEARCH',
    labels: {},
  };
}

function extract_gke_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    location: region,
    initial_node_count: data.nodeCount || 3,
    machine_type: data.machineType || 'e2-standard-2',
    labels: {},
  };
}

function extract_domain_mapping_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    domain: [data.subdomain, data.hostname].filter(Boolean).join('.') || (data.hostname as string) || '',
    hostname: (data.hostname as string) || '',
    subdomain: (data.subdomain as string) || '',
    ssl_mode: (data.sslMode as string) || 'auto',
    region,
    labels: {},
  };
}

function extract_custom_domain_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  const domain = String(data.domain || '').trim();
  const auto_provision = data.autoProvisionCert !== false;
  return {
    // Phase 8 — managed SSL certificate properties. The handler reads
    // `managed: true` + `domains: [...]` to decide between GCP-managed
    // and bring-your-own cert paths.
    managed: auto_provision,
    domains: domain ? [domain] : [],
    ssl_certificate_id: (data.sslCertificateId as string) || '',
    enable_https: data.enableHttps !== false,
    redirect_http: data.redirectHttpToHttps !== false,
    labels: {},
  };
}

function extract_backend_bucket_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  return {
    bucket_name: (data.bucket_name as string) || (data.name as string) || '',
    enable_cdn: data.enable_cdn !== false,
    labels: {},
  };
}

function extract_firebase_hosting_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  // Firebase Hosting only needs a few fields:
  //   - domain (optional): user's custom domain. Registered with
  //     Firebase Hosting which provisions a managed SSL cert.
  //   - repository / branch / output_directory / build_command:
  //     populated by Pass 1.4 from the connected Source.Repository.
  //     The handler uses these to download the GitHub repo and upload
  //     its files to Hosting (skipping the placeholder).
  //   - source.repo / source.branch: legacy structured form, kept as
  //     a fallback.
  const domain = String(data.domain || '').trim();
  const sourceObj = (data.source as { repo?: string; branch?: string } | undefined) || {};
  const repository = String(data.repository || sourceObj.repo || '').trim();
  const branch = String(data.branch || sourceObj.branch || '').trim();
  return {
    domain: domain && domain !== 'example.com' ? domain : undefined,
    repository: repository || undefined,
    branch: branch || 'main',
    output_directory: String(data.output_directory || data.outputDirectory || '').trim() || undefined,
    build_command: String(data.build_command || data.buildCommand || '').trim() || undefined,
    source_path: String(data.source_path || data.path || '').trim() || undefined,
    labels: {},
  };
}

// =============================================================================
// Property extraction dispatcher
// =============================================================================

const PROPERTY_EXTRACTORS: Record<string, (data: Record<string, unknown>, region: string) => Record<string, unknown>> =
  {
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
    'gcp.compute.managedSslCertificate': extract_custom_domain_properties,
    'gcp.compute.backendBucket': extract_backend_bucket_properties,
    'gcp.firebase.hosting': extract_firebase_hosting_properties,
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
/**
 * Generate a stable resource name from the canvas node id and its concrete
 * resource type. Deterministic, short, collision-resistant. Crucially, it
 * does NOT depend on `label` or any user-editable field — renaming a block
 * on the canvas keeps the same resource name.
 *
 * The `ice-` prefix makes ICE-deployed resources easy to spot in the GCP
 * console before Phase 1's standard labels propagate.
 */
function generate_stable_name(resource_type: string, node_id: string): string {
  const type_slug = resource_type.split('.').pop() || 'resource';
  const hash = createHash('sha256').update(node_id).digest('hex').slice(0, 10);
  return sanitize_name(`ice-${type_slug}-${hash}`);
}

export function translate_card_to_graph(input: CardTranslationInput): CardTranslationResult {
  const { nodes, edges, provider, projectName, region = 'us-central1', existing_names, cardId } = input;

  const warnings: string[] = [];
  const skipped: SkippedNode[] = [];

  // ENGINE-3: Warn if provider has no deployer support
  if (DESIGN_ONLY_PROVIDERS.has(provider)) {
    warnings.push(
      `Provider "${provider}" is design-only — deployment is not yet supported. ` +
        `Blocks can be used for architecture planning but will not be provisioned.`,
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
  const deployables: DeployableNodeInfo[] = [];
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
      warnings.push(`No ${provider} mapping for iceType "${ice_type}" (node: ${node.data.label || node.id}). Skipped.`);
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

    // Phase 1 — stable resource identity.
    //
    // Priority order:
    //   1. An existing name from the DeployedResourceMapping table (survives
    //      label renames + canvas moves).
    //   2. A fresh deterministic hash-based name for novel nodes.
    //
    // The old `sanitize_name(`${label}-${node.id.slice(-6)}`)` scheme was
    // replaced entirely: it leaked the user-facing label into the resource
    // name, so renaming a block produced a new name and triggered a
    // destroy-recreate cycle.
    const label = (node.data.label as string) || ice_type.split('.').pop() || 'resource';
    const existing = existing_names?.get(node.id);
    const name = existing ?? generate_stable_name(gcp_type, node.id);

    // Standard labels for every resource so deployed state is discoverable
    // in the GCP console via `gcloud ... --filter="labels.ice-managed=true"`.
    const baseLabels: Record<string, string> = {
      'ice-managed': 'true',
      'ice-source-id': sanitize_label_value(node.id),
      'ice-type': sanitize_label_value(ice_type),
      'ice-project': sanitize_label_value(projectName),
    };
    if (input.environment) baseLabels['ice-environment'] = sanitize_label_value(input.environment);
    if (cardId) baseLabels['ice-card-id'] = sanitize_label_value(cardId);

    // Merge with any user-provided labels from the property extractor.
    const existingPropLabels =
      (properties && typeof properties === 'object' && 'labels' in (properties as any))
        ? ((properties as any).labels as Record<string, unknown>) || {}
        : {};
    (properties as any).labels = { ...baseLabels, ...existingPropLabels };

    // Add node to graph
    const result = graph.add_node({
      type: gcp_type,
      name,
      properties,
      labels: baseLabels,
    });

    if (result.success) {
      card_id_to_name.set(node.id, name);
      deployables.push({
        node_id: node.id,
        label,
        ice_type,
        resource_type: gcp_type,
        resource_name: name,
      });
      deployable_count++;
    } else {
      // Name collision (only possible for pre-existing names or hash
      // collisions — realistically never for new deploys). Append a short
      // secondary salt and retry.
      const alt_name = sanitize_name(`${name}-alt`);
      const alt_result = graph.add_node({
        type: gcp_type,
        name: alt_name,
        properties,
        labels: baseLabels,
      });
      if (alt_result.success) {
        card_id_to_name.set(node.id, alt_name);
        deployables.push({
          node_id: node.id,
          label,
          ice_type,
          resource_type: gcp_type,
          resource_name: alt_name,
        });
        deployable_count++;
      } else {
        warnings.push(`Failed to add node "${label}": ${alt_result.errors?.join(', ')}`);
      }
    }
  }

  // ─── Pass 1.4 — Source.Repository → compute block wiring ───────────────
  //
  // Source.Repository blocks are UI-only — they're not deployed as their
  // own resource. They exist to declare "this compute block deploys from
  // this repo with this build command". The handlers (Firebase Hosting
  // for static sites, Cloud Run via Cloud Build for containers) need
  // these fields on the compute node's own properties because the deploy
  // engine doesn't pass edge metadata.
  //
  // For each edge whose source is a Source.Repository node, copy
  // `repository`, `branch`, `buildCommand`, `outputDirectory`, and
  // `path` onto the target compute node — but only when the target
  // doesn't already have a non-empty value (the user's explicit per-block
  // override always wins).
  for (const edge of edges) {
    const src = nodes.find((n) => n.id === edge.source);
    const dst = nodes.find((n) => n.id === edge.target);
    if (!src || !dst) continue;
    const srcIce = (src.data?.iceType as string) || '';
    const dstIce = (dst.data?.iceType as string) || '';
    let repoNode: typeof src | null = null;
    let computeNode: typeof src | null = null;
    if (srcIce === 'Source.Repository') {
      repoNode = src;
      computeNode = dst;
    } else if (dstIce === 'Source.Repository') {
      repoNode = dst;
      computeNode = src;
    } else {
      continue;
    }
    const computeName = card_id_to_name.get(computeNode.id);
    if (!computeName) continue;
    const computeGraphNode = graph.nodes.get(computeName as any);
    if (!computeGraphNode) continue;

    const repoData = repoNode.data || {};
    const targetProps = computeGraphNode.properties as Record<string, unknown>;
    const fieldsToCopy: Array<[string, string]> = [
      ['repository', 'repository'],
      ['branch', 'branch'],
      ['buildCommand', 'build_command'],
      ['outputDirectory', 'output_directory'],
      ['path', 'source_path'],
    ];
    // Connected Source.Repository ALWAYS wins. Mirrors how
    // Network.CustomDomain → target.domain works: the wired source
    // block is the declarative source of truth, and any local value
    // on the target is treated as a stale leftover. Without this,
    // older Pass-1.4 logic only overwrote `undefined`/empty fields,
    // which silently kept stale repo names from earlier deploys.
    for (const [from, to] of fieldsToCopy) {
      const value = (repoData as any)[from];
      if (value !== undefined && value !== '') {
        targetProps[to] = value;
      }
    }
  }

  // ─── Pass 1.45 — Network.CustomDomain → target host propagation ────────
  //
  // CustomDomain blocks are UI-only — they don't compile to a deployable
  // resource. Their job is to carry a root domain plus per-edge
  // subdomains, and propagate the resulting `<subdomain>.<domain>` (or
  // bare `<domain>` for blank subdomain) onto each connected target's
  // `domain` property. The provider handlers then pick up the domain
  // from the target's properties and register it natively (Firebase
  // Hosting custom domain registration, AWS Amplify domain associations,
  // etc.).
  //
  // CustomDomain ALWAYS wins over the target block's own `domain`
  // field. Connecting a service to a CustomDomain block is a clear
  // declarative statement: "this service's hostname is governed by
  // that domain block." If the user later disconnects the edge, the
  // target block's own `domain` field becomes authoritative again.
  for (const edge of edges) {
    const src = nodes.find((n) => n.id === edge.source);
    const dst = nodes.find((n) => n.id === edge.target);
    if (!src || !dst) continue;
    const srcIce = (src.data?.iceType as string) || '';
    const dstIce = (dst.data?.iceType as string) || '';
    let domainNode: typeof src | null = null;
    let targetNode: typeof src | null = null;
    if (srcIce === 'Network.CustomDomain') {
      domainNode = src;
      targetNode = dst;
    } else if (dstIce === 'Network.CustomDomain') {
      domainNode = dst;
      targetNode = src;
    } else {
      continue;
    }
    const targetIce = (targetNode.data?.iceType as string) || '';
    if (!/^Compute\./.test(targetIce)) continue;

    const targetName = card_id_to_name.get(targetNode.id);
    if (!targetName) continue;
    const targetGraphNode = graph.nodes.get(targetName as any);
    if (!targetGraphNode) continue;

    const rootDomain = String(domainNode.data?.domain || '').trim();
    if (!rootDomain || rootDomain === 'example.com') continue;

    // Subdomain resolution priority:
    //   1. edge.data.routeId → look up the route on the source block
    //      (the new per-row port model where each route is a slot)
    //   2. edge.data.subdomain → legacy single-subdomain edge field
    //      (kept for back-compat with edges created before routes existed)
    //   3. blank → root domain
    let subdomain = '';
    const routeId = (edge.data as any)?.routeId as string | undefined;
    if (routeId) {
      const routes = (domainNode.data?.routes as Array<{ id: string; subdomain: string }> | undefined) || [];
      const route = routes.find((r) => r.id === routeId);
      subdomain = (route?.subdomain || '').trim();
    } else {
      subdomain = ((edge.data as any)?.subdomain as string | undefined)?.trim() || '';
    }
    const fullHost = subdomain ? `${subdomain}.${rootDomain}` : rootDomain;

    const targetProps = targetGraphNode.properties as Record<string, unknown>;
    targetProps.domain = fullHost;
  }

  // ─── Pass 1.5 — PublicEndpoint semantic wiring ─────────────────────────
  //
  // The `Network.PublicEndpoint` block is the single "make my services
  // reachable from the internet" primitive. It compiles to a full load
  // balancer chain:
  //
  //   PublicEndpoint → forwarding rule → target proxy → URL map → backend bucket/service → bucket/service
  //                                              ↑
  //                                       managed SSL cert (auto-provisioned)
  //
  // The load balancer handler creates the full chain from a single
  // `gcp.compute.globalForwardingRule` node — this pass computes the
  // backend references, the list of hosts (root domain + each
  // subdomain from outgoing edges), and the URL map host rules, then
  // attaches them as properties on the forwarding rule node.
  //
  // Multi-subdomain support: each edge FROM the PublicEndpoint node to
  // a compute target can carry `edge.data.subdomain`. Blank = root.
  // Non-blank = a host rule like `api.example.com → api-backend-service`.
  // The managed SSL cert includes every unique host.

  // For each compute target connected to a PublicEndpoint, we create a
  // backend ref — either a `gcp.compute.backendBucket` (for static sites)
  // or a `gcp.compute.backendService` backed by a serverless NEG (for
  // Cloud Run / Container / SSRSite / ServerlessFunction). The actual
  // NEG + backend service resources are created inline by the load
  // balancer handler at deploy time because they need the runtime
  // region, which the translator doesn't have.
  const staticSiteToForwardingRule = new Map<string, string>(); // static site node id → forwarding rule resource name

  // Map every PublicEndpoint node to its connected backends.
  type BackendEntry = {
    subdomain: string;
    targetNodeId: string;
    targetResourceName: string;
    backendBucketName?: string;
    // For service-type backends (Cloud Run, etc), the original source
    // service name we'll wrap in a NEG, plus the synthesized backend
    // service name the URL map references.
    sourceServiceName?: string;
    backendServiceName?: string;
    targetIceType: string;
  };
  const endpointToBackends = new Map<string, BackendEntry[]>();

  for (const edge of edges) {
    const src = nodes.find((n) => n.id === edge.source);
    const dst = nodes.find((n) => n.id === edge.target);
    if (!src || !dst) continue;
    const srcIce = (src.data?.iceType as string) || '';
    const dstIce = (dst.data?.iceType as string) || '';
    const isEndpointEdge =
      srcIce === 'Network.PublicEndpoint' || dstIce === 'Network.PublicEndpoint';
    if (!isEndpointEdge) continue;

    const endpointNode = srcIce === 'Network.PublicEndpoint' ? src : dst;
    const targetNode = srcIce === 'Network.PublicEndpoint' ? dst : src;
    const targetIce = (targetNode.data?.iceType as string) || '';

    // Only compute targets are valid backends. Skip edges to requirements,
    // config, repositories, etc.
    if (!/^Compute\./.test(targetIce)) continue;

    const targetResourceName = card_id_to_name.get(targetNode.id);
    if (!targetResourceName) continue;

    const subdomain = ((edge.data as any)?.subdomain as string | undefined)?.trim() || '';

    const list = endpointToBackends.get(endpointNode.id) || [];
    list.push({
      subdomain,
      targetNodeId: targetNode.id,
      targetResourceName,
      targetIceType: targetIce,
    });
    endpointToBackends.set(endpointNode.id, list);
  }

  // For each PublicEndpoint, build backend buckets + collect host rules +
  // wire everything onto the forwarding rule node.
  for (const [endpointId, backends] of endpointToBackends.entries()) {
    const endpointNode = nodes.find((n) => n.id === endpointId);
    if (!endpointNode) continue;
    const forwardingResourceName = card_id_to_name.get(endpointId);
    if (!forwardingResourceName) continue;

    const rootDomain = ((endpointNode.data?.domain as string) || '').trim();
    const enableHttps = (endpointNode.data?.enableHttps as boolean | undefined) !== false;
    const autoProvisionCert =
      (endpointNode.data?.autoProvisionCert as boolean | undefined) !== false;
    const redirectHttpToHttps =
      (endpointNode.data?.redirectHttpToHttps as boolean | undefined) !== false;

    // Build hostRules for the URL map. Each backend gets a host like
    // `<subdomain>.<rootDomain>` (or just `<rootDomain>` for blank
    // subdomain). If rootDomain is empty, fallback to IP-only routing
    // with one default backend.
    //
    // `sourceServiceName` is only set for service-type backends — the
    // LB handler uses it to target a Serverless NEG at the actual
    // Cloud Run service.
    const hostRules: Array<{
      host: string;
      backendName: string;
      backendType: 'bucket' | 'service';
      sourceServiceName?: string;
    }> = [];
    const defaultBackends: BackendEntry[] = [];

    // Compute types that compile to Cloud Run services — each of these
    // gets wrapped in a Serverless NEG + backend service by the LB
    // handler at deploy time. Static sites use backendBuckets instead.
    const SERVICE_BACKEND_ICE_TYPES = new Set([
      'Compute.Container',
      'Compute.BackendAPI',
      'Compute.SSRSite',
      'Compute.Worker',
      'Compute.ServerlessFunction',
    ]);

    for (const be of backends) {
      // Static sites on GCP now compile to Firebase Hosting (which
      // gives a public HTTPS URL out of the box, with its own CDN +
      // managed cert + optional custom domain). The Public Endpoint
      // load-balancer chain is REDUNDANT for Firebase Hosting — it
      // serves traffic itself, no backend bucket / URL map / forwarding
      // rule needed. We skip the LB wiring here and let the Firebase
      // Hosting handler register the custom domain on its own.
      //
      // The static site node still gets the user's custom domain
      // propagated so the Firebase Hosting handler picks it up.
      if (be.targetIceType === 'Compute.StaticSite') {
        // Propagate the PublicEndpoint's domain onto the static site
        // node so the Firebase Hosting handler can register it as a
        // custom domain. Subdomains become per-site subdomains; blank
        // becomes the root domain.
        const targetGraphNode = graph.nodes.get(be.targetResourceName as any);
        if (targetGraphNode && rootDomain) {
          const fullHost = be.subdomain ? `${be.subdomain}.${rootDomain}` : rootDomain;
          (targetGraphNode.properties as any).domain = fullHost;
        }
        // Mark the static-site → forwarding-rule mapping so the post-deploy
        // overlay still knows the static site is wired to a public endpoint
        // (used for the canvas pill propagation). The forwarding rule itself
        // will be created EMPTY and skipped at deploy time when no other
        // backend uses it.
        staticSiteToForwardingRule.set(be.targetNodeId, forwardingResourceName);
        // Skip adding a host rule — Firebase Hosting serves directly.
        continue;
      }

      // Cloud Run / Container / SSR → serverless NEG + backend service.
      // The LB handler creates both resources inline because the NEG
      // needs the runtime region, which lives on the handler context
      // but not in the translator. We just record the names here and
      // pass them through `host_rules` as metadata.
      if (SERVICE_BACKEND_ICE_TYPES.has(be.targetIceType)) {
        const backendServiceName = sanitize_name(`${be.targetResourceName}-backend`);
        be.sourceServiceName = be.targetResourceName;
        be.backendServiceName = backendServiceName;

        const host = be.subdomain && rootDomain ? `${be.subdomain}.${rootDomain}` : rootDomain || '';
        if (host) {
          hostRules.push({
            host,
            backendName: backendServiceName,
            backendType: 'service',
            sourceServiceName: be.targetResourceName,
          });
        } else {
          defaultBackends.push(be);
        }
        continue;
      }

      // Unknown compute type — skip with a clear warning so the user
      // knows it's not wired.
      warnings.push(
        `Public Endpoint edge to "${be.targetNodeId}" (${be.targetIceType}) was skipped — only ` +
          'Compute.StaticSite, Container, SSRSite, BackendAPI, Worker, and ServerlessFunction are currently supported as backends.',
      );
    }

    // If the only backends were static sites (which now compile to
    // Firebase Hosting and serve traffic themselves), there's nothing
    // for the load balancer to route. Drop the forwarding rule entirely
    // — the user's PublicEndpoint block becomes a metadata-only node
    // whose role is fully absorbed by the Firebase Hosting deployables
    // it points at. Otherwise the LB would deploy with an empty URL
    // map and 502 every request.
    if (hostRules.length === 0 && defaultBackends.length === 0) {
      const removed = graph.remove_node(forwardingResourceName as any);
      if (removed) {
        const idx = deployables.findIndex((d) => d.resource_name === forwardingResourceName);
        if (idx !== -1) {
          deployables.splice(idx, 1);
          deployable_count--;
        }
      }
      continue;
    }

    // Compute the full host list for the managed SSL cert. Always
    // include the root domain. If only subdomains are wired (no blank
    // subdomain edge), we still cover the root for flexibility.
    const hostSet = new Set<string>();
    if (rootDomain) hostSet.add(rootDomain);
    for (const rule of hostRules) hostSet.add(rule.host);
    const hosts = Array.from(hostSet);

    // Attach the host list and URL map rules to the forwarding rule
    // node so the load balancer handler can build the URL map.
    const frNode = graph.nodes.get(forwardingResourceName as any);
    if (frNode) {
      (frNode.properties as any).domain = rootDomain;
      (frNode.properties as any).hosts = hosts;
      (frNode.properties as any).host_rules = hostRules;
      // Single-host shortcut: the LB handler also reads `backend_bucket_name`
      // for the legacy simple-deploy path. We only set it when the default
      // backend is a BUCKET — service-type defaults flow through
      // `host_rules[0]` instead so the handler creates the NEG inline.
      const defaultBucket = defaultBackends.find((be) => be.backendBucketName)?.backendBucketName;
      if (defaultBucket) {
        (frNode.properties as any).backend_bucket_name = defaultBucket;
      }
      (frNode.properties as any).redirect_http = redirectHttpToHttps;
    }

    // Auto-provision a managed SSL cert if HTTPS is enabled and we have
    // at least one real host. The cert resource is a synthetic node
    // injected here — no user-facing block for it.
    if (enableHttps && autoProvisionCert && hosts.length > 0) {
      const certName = sanitize_name(`${forwardingResourceName}-cert`);
      const certKey = `${endpointId}:managed-cert`;
      if (!card_id_to_name.get(certKey)) {
        const certProps = {
          domains: hosts,
          managed: true,
          labels: {
            'ice-managed': 'true',
            'ice-source-id': sanitize_label_value(endpointId),
            'ice-type': 'public-endpoint-cert',
            'ice-project': sanitize_label_value(projectName),
          },
        };
        const certResult = graph.add_node({
          type: 'gcp.compute.managedSslCertificate',
          name: certName,
          properties: certProps,
          labels: certProps.labels,
        });
        if (certResult.success) {
          card_id_to_name.set(certKey, certName);
          deployables.push({
            node_id: certKey,
            label: `${endpointNode.data?.label || 'Public Endpoint'} cert`,
            ice_type: 'Network.PublicEndpoint',
            resource_type: 'gcp.compute.managedSslCertificate',
            resource_name: certName,
          });
          deployable_count++;
        }
      }
      if (frNode) {
        (frNode.properties as any).ssl_certificate_name = certName;
        (frNode.properties as any).protocol = 'HTTPS';
        (frNode.properties as any).port_range = '443';
      }
    } else if (frNode) {
      (frNode.properties as any).protocol = 'HTTP';
      (frNode.properties as any).port_range = '80';
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
    deployables,
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
 * Sanitize a value for use as a GCP resource label.
 * GCP label values: lowercase letters, digits, underscores, hyphens. Max 63.
 * Empty strings are not valid label values — fall back to a placeholder.
 */
function sanitize_label_value(value: string | undefined | null): string {
  if (!value) return 'unknown';
  const cleaned = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63);
  return cleaned || 'unknown';
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
