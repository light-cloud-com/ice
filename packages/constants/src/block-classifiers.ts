/**
 * Block role classification — the single source of truth for "what
 * kind of block is this iceType?" across the whole monorepo.
 *
 * The cardinal rule (see CLAUDE memory / feedback): cross-cutting
 * layers MUST NOT scatter `if (iceType === 'X')` or `t.startsWith('Y')`
 * branches throughout the codebase. They consult the schema-shaped
 * tables here and the connection-rules + propagation-rules engines
 * stay generic.
 *
 * Lives in `@ice/constants` because BOTH `@ice/types/connection-rules/
 * predicates.ts` AND `@ice/core/compute/propagation-rules.ts` need
 * identical block classification. Previously both files duplicated
 * the same predicate bodies (regex + prefix matches); this module
 * collapses them into one declaration.
 *
 * Three lookup tiers, evaluated in order — fastest first:
 *   1. `BLOCK_ROLES_BY_ICE_TYPE`: exact iceType → roles. Use this for
 *      narrow, one-off bindings (Source.Repository, Config.Environment).
 *   2. `BLOCK_ROLES_BY_PREFIX`: category prefix → role. Use this for
 *      auto-inheritance (every `Database.*` is a `database` for free,
 *      so a new MySQL variant doesn't need a table edit).
 *   3. `BLOCK_ROLES_BY_REGEX`: regex pattern → role. Use this ONLY for
 *      provider-specific iceTypes that don't fit a clean prefix
 *      (e.g. `PostgreSQL`, `Redis`, `Kafka` engines authored under
 *      varied namespaces by per-provider blueprints).
 */

export type BlockRole =
  // Compute
  | 'backend'
  | 'frontend'
  /**
   * Compute backend that compiles to a Cloud Run / ECS / Container App
   * service behind a Serverless NEG when wired through a public-ingress
   * endpoint. Narrower than `backend` — excludes StaticSite (which
   * compiles to a backendBucket instead). Used by:
   *   - the LB-wiring pass (which serverless-NEG vs backendBucket dispatch)
   *   - the network-isolation ingress override on the translator
   */
  | 'serviceBackend'
  // Data
  | 'database'
  | 'cache'
  | 'storage'
  | 'queue'
  | 'search'
  | 'vectorDb'
  | 'llm'
  | 'dataWarehouse'
  // Ops / Config
  | 'repo'
  | 'envConfig'
  | 'secrets'
  // Network / Auth
  | 'gateway'
  | 'auth'
  | 'monitoring'
  // Specialised network blocks
  | 'customDomain'
  | 'privateNetwork'
  | 'reroute'
  // Composite — anything that owns / propagates a public host
  | 'domain'
  /**
   * The block represents a publicly-served static website. When it
   * compiles to a bucket-style resource on the active provider (e.g.
   * AWS `Compute.StaticSite` → `aws.s3.bucket`), the bucket extractor
   * flips `public_access` + `website_hosting` so the asset can serve
   * traffic directly. Providers where it compiles to a self-serving
   * resource (e.g. GCP Firebase Hosting) don't need this — the bucket
   * extractor isn't invoked at all.
   */
  | 'publicWebsiteSource';

export const BLOCK_ROLES_BY_ICE_TYPE: Record<string, ReadonlyArray<BlockRole>> = {
  // Service backends — compile to Cloud Run / ECS service with a
  // Serverless NEG when wired behind a public-ingress endpoint.
  // Compute.StaticSite is INTENTIONALLY omitted: it compiles to a
  // backendBucket via Firebase Hosting, not a NEG.
  'Compute.Container': ['serviceBackend'],
  'Compute.BackendAPI': ['serviceBackend'],
  'Compute.SSRSite': ['serviceBackend'],
  'Compute.Worker': ['serviceBackend'],
  'Compute.ServerlessFunction': ['serviceBackend'],
  // Frontend block representing a public static site. On providers
  // where it compiles to a bucket (AWS S3) the storage extractor
  // flips public + website-hosting based on this role.
  'Compute.StaticSite': ['publicWebsiteSource'],
  // Ops / Config blocks — narrow exact matches.
  'Source.Repository': ['repo'],
  'Config.Environment': ['envConfig'],
  'Security.Secret': ['secrets'],
  'Security.Identity': ['auth'],
  // Specialised network blocks.
  'Network.Gateway': ['gateway'],
  'Network.CustomDomain': ['customDomain', 'domain'],
  'Network.PublicEndpoint': ['domain'],
  'Network.PrivateNetwork': ['privateNetwork'],
  'Util.Reroute': ['reroute'],
  // High-level analytics + AI blocks (no clean prefix; exact iceType).
  'Analytics.Search': ['search'],
  'Analytics.DataWarehouse': ['dataWarehouse'],
  'AI.VectorDB': ['vectorDb'],
  'AI.LLMGateway': ['llm'],
  'AI.ModelServing': ['llm'],
};

export const BLOCK_ROLES_BY_PREFIX: ReadonlyArray<{ prefix: string; role: BlockRole }> = [
  { prefix: 'Compute.', role: 'backend' },
  { prefix: 'Database.', role: 'database' },
  { prefix: 'Storage.', role: 'storage' },
  { prefix: 'Messaging.', role: 'queue' },
  { prefix: 'Monitoring.', role: 'monitoring' },
  { prefix: 'Log.', role: 'monitoring' },
];

export const BLOCK_ROLES_BY_REGEX: ReadonlyArray<{ pattern: RegExp; role: BlockRole }> = [
  // Backend — provider-specific compute iceTypes that don't start with `Compute.`.
  { pattern: /Backend|Container|Worker|Function|CronJob|Scheduled|AppPlatform|OCIFunctions/i, role: 'backend' },
  // Frontend — static / SSR sites under varied namespaces.
  { pattern: /StaticSite|SSRSite|Frontend/i, role: 'frontend' },
  // Database engines.
  {
    pattern: /PostgreSQL|MySQL|MongoDB|DynamoDB|Firestore|CosmosDB|AutonomousDB|Tablestore|ManagedDB/i,
    role: 'database',
  },
  // Cache engines.
  { pattern: /Redis|Cache|Memcache/i, role: 'cache' },
  // Storage engines.
  { pattern: /Bucket|S3|GCS|Blob|ObjectStorage|Spaces/i, role: 'storage' },
  // Queue / messaging engines.
  { pattern: /Queue|SQS|SNS|PubSub|ServiceBus|RabbitMQ|Kafka|Event/i, role: 'queue' },
  // Search engines.
  { pattern: /Search|Elasticsearch/i, role: 'search' },
  // Vector DBs.
  { pattern: /VectorDB|Vector/i, role: 'vectorDb' },
  // LLM gateways / model serving.
  { pattern: /LLM|ModelServing/i, role: 'llm' },
  // Data warehouses.
  { pattern: /Warehouse|BigQuery|Redshift|Synapse/i, role: 'dataWarehouse' },
  // Secret stores (Vault, KMS, etc. authored under varied namespaces).
  { pattern: /Secret|Vault|Certificate/i, role: 'secrets' },
  // API gateways / load balancers / WAF authored under varied namespaces.
  { pattern: /Gateway|LoadBalancer|Internet|WAF/i, role: 'gateway' },
  // Auth / IAM / identity providers.
  { pattern: /Auth|Identity|IAM/i, role: 'auth' },
  // Monitoring sinks authored under varied namespaces.
  { pattern: /Log|Monitor|Observability|Terminal/i, role: 'monitoring' },
  // Domain blocks under varied namespaces.
  { pattern: /Domain|DNS/i, role: 'domain' },
];

/**
 * True iff `iceType` carries the given role (per any of the three
 * lookup tiers). Replaces the per-package classifier functions —
 * connection-rules and propagation-rules now both call this.
 */
export function hasBlockRole(iceType: string, role: BlockRole): boolean {
  if (BLOCK_ROLES_BY_ICE_TYPE[iceType]?.includes(role)) return true;
  for (const e of BLOCK_ROLES_BY_PREFIX) {
    if (e.role === role && iceType.startsWith(e.prefix)) return true;
  }
  for (const e of BLOCK_ROLES_BY_REGEX) {
    if (e.role === role && e.pattern.test(iceType)) return true;
  }
  return false;
}
