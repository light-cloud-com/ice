/**
 * Connection Rules — Single Source of Truth
 *
 * Shared across: frontend rendering, properties panel, AI assistant, deploy engine.
 *
 * Four connection categories:
 *   TRAFFIC  — runtime network flow (Backend→DB, Frontend→Backend)
 *   PIPELINE — code deploys here (GitHub Repo→Service)
 *   CONFIG   — deploy-time configuration (Service→EnvVars, Service→Secrets)
 *   DNS      — domain routing (Domain→Gateway)
 *
 * Containers (VPC, Subnet, Group) CANNOT have connections.
 */

// ─── Core Types ──────────────────────────────────────────────────────────────

export type ConnectionCategory = 'traffic' | 'pipeline' | 'config' | 'dns';
export type TrafficType = 'request' | 'data' | 'publish' | 'subscribe' | 'stream';
export type LineStyle = 'solid' | 'dashed' | 'dotted' | 'thin';

export interface ConnectionMeta {
  category: ConnectionCategory;
  trafficType?: TrafficType;
  lineStyle: LineStyle;
  color: string;
  port?: number;
  envVarName?: string;
  flip?: boolean;
  label?: string;
}

export interface ConnectionWarning {
  level: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const CATEGORY_COLORS: Record<ConnectionCategory, string> = {
  traffic: '#22c55e',
  pipeline: '#8b5cf6',
  config: '#f59e0b',
  dns: '#22d3ee',
};

export const CATEGORY_LABELS: Record<ConnectionCategory, string> = {
  traffic: 'traffic',
  pipeline: 'pipeline',
  config: 'config',
  dns: 'dns',
};

/** Maps new categories to legacy relationship values for backend compat */
export const CATEGORY_TO_RELATIONSHIP: Record<ConnectionCategory, string> = {
  traffic: 'connects_to',
  pipeline: 'connects_to',
  config: 'depends_on',
  dns: 'connects_to',
};

// ─── Block Type Classification ───────────────────────────────────────────────
// These functions classify iceType strings into logical groups.
// Used by inferConnectionMeta, validateConnection, and the AI prompt generator.

export function isDatabase(t: string): boolean {
  return (
    t.startsWith('Database.') ||
    /PostgreSQL|MySQL|MongoDB|DynamoDB|Firestore|CosmosDB|AutonomousDB|Tablestore|ManagedDB/i.test(t)
  );
}
export function isCache(t: string): boolean {
  return /Redis|Cache|Memcache/i.test(t);
}
export function isQueue(t: string): boolean {
  return t.startsWith('Messaging.') || /Queue|SQS|SNS|PubSub|ServiceBus|RabbitMQ|Kafka|Event/i.test(t);
}
export function isStorage(t: string): boolean {
  return t.startsWith('Storage.') || /Bucket|S3|GCS|Blob|ObjectStorage|Spaces/i.test(t);
}
export function isBackend(t: string): boolean {
  return (
    /Backend|Container|Worker|Function|CronJob|Scheduled|AppPlatform|OCIFunctions/i.test(t) ||
    t.startsWith('Compute.') ||
    t.startsWith('Compute.')
  );
}
export function isFrontend(t: string): boolean {
  return /StaticSite|SSRSite|Frontend/i.test(t);
}
export function isGateway(t: string): boolean {
  return /Gateway|LoadBalancer|Internet/i.test(t) || t === 'Network.Gateway';
}
export function isAuth(t: string): boolean {
  return /Auth|Identity|IAM/i.test(t) || t === 'Security.Identity';
}
export function isSecrets(t: string): boolean {
  return /Secret|Vault/i.test(t) || t === 'Security.Secret';
}
export function isMonitoring(t: string): boolean {
  return /Log|Monitor|Observability|Terminal/i.test(t) || t.startsWith('Monitoring.') || t.startsWith('Log.');
}
export function isSearch(t: string): boolean {
  return /Search|Elasticsearch/i.test(t) || t === 'Analytics.Search';
}
export function isDataWarehouse(t: string): boolean {
  return /Warehouse|BigQuery|Redshift|Synapse/i.test(t) || t === 'Analytics.DataWarehouse';
}
export function isVectorDb(t: string): boolean {
  return /VectorDB|Vector/i.test(t) || t === 'AI.VectorDB';
}
export function isLLM(t: string): boolean {
  return /LLM|ModelServing/i.test(t) || t === 'AI.LLMGateway' || t === 'AI.ModelServing';
}
export function isRepo(t: string): boolean {
  return t === 'Source.Repository';
}
export function isEnvConfig(t: string): boolean {
  return t === 'Config.Environment';
}
export function isDomain(t: string): boolean {
  return t === 'Network.Domain' || /Domain|DNS/i.test(t);
}
export function isContainer(iceType: string, nodeType?: string): boolean {
  if (nodeType === 'container' || nodeType === 'group') return true;
  return iceType === 'Network.VPC' || iceType === 'Network.Subnet' || iceType.startsWith('Group.');
}

// ─── Default Ports ───────────────────────────────────────────────────────────

export const DEFAULT_PORTS: Record<string, number> = {
  PostgreSQL: 5432,
  MySQL: 3306,
  MongoDB: 27017,
  Redis: 6379,
  RabbitMQ: 5672,
  Elasticsearch: 9200,
};

export function getDefaultPort(iceType: string): number | undefined {
  for (const [key, port] of Object.entries(DEFAULT_PORTS)) {
    if (new RegExp(key, 'i').test(iceType)) return port;
  }
  return undefined;
}

// ─── Default Env Var Names ───────────────────────────────────────────────────

export const DEFAULT_ENV_VARS: Record<string, string> = {
  PostgreSQL: 'DATABASE_URL',
  MySQL: 'DATABASE_URL',
  MongoDB: 'MONGODB_URI',
  Redis: 'REDIS_URL',
  RabbitMQ: 'AMQP_URL',
  SQS: 'SQS_QUEUE_URL',
  SNS: 'SNS_TOPIC_ARN',
  PubSub: 'PUBSUB_TOPIC',
  ServiceBus: 'SERVICE_BUS_CONNECTION',
  Kafka: 'KAFKA_BROKER_URL',
  Elasticsearch: 'ELASTICSEARCH_URL',
  Search: 'ELASTICSEARCH_URL',
  VectorDB: 'VECTOR_DB_URL',
  LLM: 'LLM_API_URL',
  Warehouse: 'DATA_WAREHOUSE_URL',
  Auth: 'AUTH_URL',
  Secret: 'SECRETS_ARN',
};

export function getEnvVarName(iceType: string): string | undefined {
  if (isStorage(iceType)) return 'STORAGE_BUCKET';
  for (const [key, envVar] of Object.entries(DEFAULT_ENV_VARS)) {
    if (new RegExp(key, 'i').test(iceType)) return envVar;
  }
  return undefined;
}

// ─── Connection Inference ────────────────────────────────────────────────────

export function inferConnectionMeta(src: string, tgt: string): ConnectionMeta {
  const C = CATEGORY_COLORS;

  // PIPELINE
  if (isRepo(src) && !isRepo(tgt)) return { category: 'pipeline', lineStyle: 'dashed', color: C.pipeline };
  if (isRepo(tgt) && !isRepo(src)) return { category: 'pipeline', lineStyle: 'dashed', color: C.pipeline, flip: true };

  // CONFIG
  if (isEnvConfig(tgt) && !isEnvConfig(src)) return { category: 'config', lineStyle: 'dotted', color: C.config };
  if (isEnvConfig(src) && !isEnvConfig(tgt))
    return { category: 'config', lineStyle: 'dotted', color: C.config, flip: true };
  if (isSecrets(tgt) && !isSecrets(src))
    return { category: 'config', lineStyle: 'dotted', color: C.config, envVarName: getEnvVarName(tgt) };
  if (isSecrets(src) && !isSecrets(tgt))
    return { category: 'config', lineStyle: 'dotted', color: C.config, envVarName: getEnvVarName(src), flip: true };

  // DNS
  if (isDomain(src) && !isDomain(tgt)) return { category: 'dns', lineStyle: 'solid', color: C.dns };
  if (isDomain(tgt) && !isDomain(src)) return { category: 'dns', lineStyle: 'solid', color: C.dns, flip: true };

  // TRAFFIC — stream
  if (isMonitoring(tgt)) return { category: 'traffic', trafficType: 'stream', lineStyle: 'thin', color: C.traffic };
  if (isMonitoring(src) && !isMonitoring(tgt))
    return { category: 'traffic', trafficType: 'stream', lineStyle: 'thin', color: C.traffic, flip: true };

  // TRAFFIC — subscribe
  if (isQueue(src) && isBackend(tgt))
    return {
      category: 'traffic',
      trafficType: 'subscribe',
      lineStyle: 'dotted',
      color: C.traffic,
      envVarName: getEnvVarName(src),
    };

  // TRAFFIC — publish
  if (isBackend(src) && isQueue(tgt))
    return {
      category: 'traffic',
      trafficType: 'publish',
      lineStyle: 'dashed',
      color: C.traffic,
      port: getDefaultPort(tgt),
      envVarName: getEnvVarName(tgt),
    };
  if (isBackend(src) && isDataWarehouse(tgt))
    return {
      category: 'traffic',
      trafficType: 'publish',
      lineStyle: 'dashed',
      color: C.traffic,
      envVarName: getEnvVarName(tgt),
    };

  // TRAFFIC — data
  if (isBackend(src) && isDatabase(tgt))
    return {
      category: 'traffic',
      trafficType: 'data',
      lineStyle: 'solid',
      color: C.traffic,
      port: getDefaultPort(tgt),
      envVarName: getEnvVarName(tgt),
    };
  if (isBackend(src) && isCache(tgt))
    return {
      category: 'traffic',
      trafficType: 'data',
      lineStyle: 'solid',
      color: C.traffic,
      port: 6379,
      envVarName: getEnvVarName(tgt),
    };
  if (isBackend(src) && isStorage(tgt))
    return {
      category: 'traffic',
      trafficType: 'data',
      lineStyle: 'solid',
      color: C.traffic,
      envVarName: getEnvVarName(tgt),
    };
  if (isBackend(src) && isSearch(tgt))
    return {
      category: 'traffic',
      trafficType: 'data',
      lineStyle: 'solid',
      color: C.traffic,
      port: 9200,
      envVarName: getEnvVarName(tgt),
    };
  if (isBackend(src) && (isVectorDb(tgt) || isLLM(tgt)))
    return {
      category: 'traffic',
      trafficType: 'data',
      lineStyle: 'solid',
      color: C.traffic,
      envVarName: getEnvVarName(tgt),
    };

  // TRAFFIC — request
  if ((isFrontend(src) || isGateway(src)) && isBackend(tgt))
    return { category: 'traffic', trafficType: 'request', lineStyle: 'solid', color: C.traffic };
  if (isGateway(src) && isFrontend(tgt))
    return { category: 'traffic', trafficType: 'request', lineStyle: 'solid', color: C.traffic };
  if (isBackend(src) && isAuth(tgt))
    return {
      category: 'traffic',
      trafficType: 'request',
      lineStyle: 'solid',
      color: C.traffic,
      envVarName: getEnvVarName(tgt),
    };
  if (isBackend(src) && isBackend(tgt))
    return { category: 'traffic', trafficType: 'request', lineStyle: 'solid', color: C.traffic };

  // Default
  return { category: 'traffic', trafficType: 'request', lineStyle: 'solid', color: C.traffic };
}

// ─── Validation ──────────────────────────────────────────────────────────────

export function validateConnection(
  src: string,
  tgt: string,
  existingEdges: Array<{ source: string; target: string }>,
  srcId: string,
  tgtId: string,
  srcNodeType?: string,
  tgtNodeType?: string,
): ConnectionWarning[] {
  const w: ConnectionWarning[] = [];
  if (isContainer(src, srcNodeType))
    w.push({
      level: 'error',
      message: `${src.split('.').pop() || 'Container'} is a container — drop resources inside it, don't connect to it`,
    });
  if (isContainer(tgt, tgtNodeType))
    w.push({
      level: 'error',
      message: `${tgt.split('.').pop() || 'Container'} is a container — drop resources inside it, don't connect to it`,
    });
  if (isFrontend(src) && isDatabase(tgt))
    w.push({
      level: 'warning',
      message: 'Direct database access from frontend is a security risk',
      suggestion: 'Add a Backend between them',
    });
  if (isFrontend(src) && isQueue(tgt))
    w.push({
      level: 'warning',
      message: 'Clients should not publish to queues directly',
      suggestion: 'Route through a Backend API',
    });
  if (
    existingEdges.some((e) => (e.source === srcId && e.target === tgtId) || (e.source === tgtId && e.target === srcId))
  )
    w.push({ level: 'warning', message: 'These blocks are already connected' });
  if (srcId === tgtId) w.push({ level: 'error', message: 'A block cannot connect to itself' });
  return w;
}

export function wouldCreateCycle(
  srcId: string,
  tgtId: string,
  edges: Array<{ source: string; target: string }>,
): boolean {
  const visited = new Set<string>();
  const queue = [tgtId];
  while (queue.length > 0) {
    const c = queue.shift()!;
    if (c === srcId) return true;
    if (visited.has(c)) continue;
    visited.add(c);
    for (const e of edges) {
      if (e.source === c && !visited.has(e.target)) queue.push(e.target);
    }
  }
  return false;
}

// ─── AI Prompt Generator ─────────────────────────────────────────────────────
// Generates the connection rules section for the AI system prompt
// from the same rules used by the UI. Single source of truth.

export function generateAiConnectionPrompt(): string {
  return `## CONNECTION CATEGORIES

Every connection falls into one of 4 categories. The category is auto-determined from block types — set the correct "relationship" value in addEdge.

### TRAFFIC (green) — runtime network flow between services
relationship: "connects_to"
Examples: Frontend → Backend, Backend → Database, Backend → Queue, Gateway → Backend
Rules:
- Request (solid line): Frontend/Gateway → Backend, Backend → Backend, Backend → Auth
- Data (solid line): Backend → Database/Cache/Storage/Search/VectorDB
- Publish (dashed line): Backend → Queue, Backend → DataWarehouse (async, fire-and-forget)
- Subscribe (dotted line): Queue → Worker (event consumption)
- Stream (thin line): Any service → Monitoring/Logs

### PIPELINE (purple) — code deployment
relationship: "connects_to"
Source.Repository → Service only. Means "this repo's code deploys to this service."
Direction: ALWAYS repo → service (never service → repo)

### CONFIG (amber) — deploy-time configuration
relationship: "depends_on"
Service → Config.EnvVars or Service → Secrets only. Means "reads config at deploy time."
Direction: ALWAYS service → config block (never config → service)

### DNS (cyan) — domain routing
relationship: "connects_to"
Networking.Domain → Service/Gateway only. Means "this domain routes to this service."
Direction: ALWAYS domain → service (never service → domain)

### CONTAINERS CANNOT HAVE EDGES
VPC, Subnet, and Group nodes are CONTAINERS. They hold resources via parentId.
NEVER create addEdge with source or target pointing to a VPC, Subnet, or Group.

### Auto-generated env vars
When a service connects to a data store, an env var is auto-injected:
${Object.entries(DEFAULT_ENV_VARS)
  .map(([k, v]) => `- ${k} → ${v}`)
  .join('\n')}
- Storage/Bucket → STORAGE_BUCKET

### Auto-detected ports
${Object.entries(DEFAULT_PORTS)
  .map(([k, v]) => `- ${k} → ${v}`)
  .join('\n')}

### Direction normalization
The arrow shows "who initiates." Auto-flip ensures:
- Repo is always SOURCE (repo → service)
- EnvVars/Secrets is always TARGET (service → config)
- Domain is always SOURCE (domain → service)
- Monitoring is always TARGET (service → logs)`;
}
