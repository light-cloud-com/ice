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
 *
 * Architecture: A declarative CONNECTION_RULES array defines every valid
 * source→target pair. All functions (canConnect, inferConnectionMeta,
 * validateConnection) derive from this single array.
 */

import {
  type ConnectionCategory,
  CATEGORY_COLORS,
  CATEGORY_TO_RELATIONSHIP,
  DEFAULT_PORTS,
  DEFAULT_ENV_VARS,
} from '@ice/constants';

export {
  type ConnectionCategory,
  CATEGORY_COLORS,
  CATEGORY_TO_RELATIONSHIP,
};

// ─── Core Types ──────────────────────────────────────────────────────────────

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

// ─── Block Type Classification ───────────────────────────────────────────────
// These functions classify iceType strings into logical groups.
// Used by the CONNECTION_RULES array and exported for external consumers.

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
  return /Gateway|LoadBalancer|Internet|WAF/i.test(t) || t === 'Network.Gateway';
}
export function isAuth(t: string): boolean {
  return /Auth|Identity|IAM/i.test(t) || t === 'Security.Identity';
}
export function isSecrets(t: string): boolean {
  return /Secret|Vault|Certificate/i.test(t) || t === 'Security.Secret';
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

/** Composite: anything deployable (backend + frontend) */
function isService(t: string): boolean {
  return isBackend(t) || isFrontend(t);
}

/** Composite: anything that can receive DNS traffic */
function isRoutable(t: string): boolean {
  return isBackend(t) || isFrontend(t) || isGateway(t);
}

// ─── Default Port / Env Var Lookup ──────────────────────────────────────────

export function getDefaultPort(iceType: string): number | undefined {
  return DEFAULT_PORTS[iceType];
}

export function getEnvVarName(iceType: string): string | undefined {
  return DEFAULT_ENV_VARS[iceType];
}

// ─── Declarative Connection Rules ───────────────────────────────────────────
// Each rule defines: "blocks matching source() CAN connect to blocks matching
// target()". First matching rule wins. This array is the single source of
// truth for canConnect(), inferConnectionMeta(), and the AI prompt generator.

export interface ConnectionRule {
  /** Human-readable label for debugging / AI prompt generation */
  label: string;
  /** Source block classifier */
  source: (iceType: string) => boolean;
  /** Target block classifier */
  target: (iceType: string) => boolean;
  /** Connection category */
  category: ConnectionCategory;
  /** Traffic sub-type (only for traffic category) */
  trafficType?: TrafficType;
  /** Visual line style */
  lineStyle: LineStyle;
  /** If true, direction should be flipped (target becomes source) */
  reverse?: boolean;
}

export const CONNECTION_RULES: ConnectionRule[] = [
  // ── TRAFFIC: request ────────────────────────────────────────────────────
  { label: 'Frontend → Backend',       source: isFrontend,   target: isBackend,       category: 'traffic', trafficType: 'request', lineStyle: 'solid' },
  { label: 'Gateway → Gateway',         source: isGateway,    target: isGateway,       category: 'traffic', trafficType: 'request', lineStyle: 'solid' },
  { label: 'Gateway → Backend',        source: isGateway,    target: isBackend,       category: 'traffic', trafficType: 'request', lineStyle: 'solid' },
  { label: 'Gateway → Frontend',       source: isGateway,    target: isFrontend,      category: 'traffic', trafficType: 'request', lineStyle: 'solid' },
  { label: 'Backend → Backend',        source: isBackend,    target: isBackend,       category: 'traffic', trafficType: 'request', lineStyle: 'solid' },
  { label: 'Backend → Auth',           source: isBackend,    target: isAuth,          category: 'traffic', trafficType: 'request', lineStyle: 'solid' },
  { label: 'Frontend → Auth',          source: isFrontend,   target: isAuth,          category: 'traffic', trafficType: 'request', lineStyle: 'solid' },
  { label: 'Frontend → Gateway',       source: isFrontend,   target: isGateway,       category: 'traffic', trafficType: 'request', lineStyle: 'solid' },

  // ── TRAFFIC: data ──────────────────────────────────────────────────────
  { label: 'Backend → Database',       source: isBackend,    target: isDatabase,      category: 'traffic', trafficType: 'data', lineStyle: 'solid' },
  { label: 'Backend → Cache',          source: isBackend,    target: isCache,         category: 'traffic', trafficType: 'data', lineStyle: 'solid' },
  { label: 'Backend → Storage',        source: isBackend,    target: isStorage,       category: 'traffic', trafficType: 'data', lineStyle: 'solid' },
  { label: 'Backend → Search',         source: isBackend,    target: isSearch,        category: 'traffic', trafficType: 'data', lineStyle: 'solid' },
  { label: 'Backend → VectorDB',       source: isBackend,    target: isVectorDb,      category: 'traffic', trafficType: 'data', lineStyle: 'solid' },
  { label: 'Backend → LLM',            source: isBackend,    target: isLLM,           category: 'traffic', trafficType: 'data', lineStyle: 'solid' },
  { label: 'Frontend → Storage',       source: isFrontend,   target: isStorage,       category: 'traffic', trafficType: 'data', lineStyle: 'solid' },

  // ── TRAFFIC: data (reverse — drag from data store to service) ──────────
  { label: 'Database → Backend (flip)',  source: isDatabase,      target: isBackend,       category: 'traffic', trafficType: 'data', lineStyle: 'solid', reverse: true },
  { label: 'Cache → Backend (flip)',     source: isCache,         target: isBackend,       category: 'traffic', trafficType: 'data', lineStyle: 'solid', reverse: true },
  { label: 'Storage → Backend (flip)',   source: isStorage,       target: isBackend,       category: 'traffic', trafficType: 'data', lineStyle: 'solid', reverse: true },
  { label: 'Storage → Frontend (flip)',  source: isStorage,       target: isFrontend,      category: 'traffic', trafficType: 'data', lineStyle: 'solid', reverse: true },
  { label: 'Search → Backend (flip)',    source: isSearch,        target: isBackend,       category: 'traffic', trafficType: 'data', lineStyle: 'solid', reverse: true },
  { label: 'VectorDB → Backend (flip)',  source: isVectorDb,      target: isBackend,       category: 'traffic', trafficType: 'data', lineStyle: 'solid', reverse: true },
  { label: 'LLM → Backend (flip)',       source: isLLM,           target: isBackend,       category: 'traffic', trafficType: 'data', lineStyle: 'solid', reverse: true },
  { label: 'Auth → Backend (flip)',      source: isAuth,          target: isBackend,       category: 'traffic', trafficType: 'data', lineStyle: 'solid', reverse: true },
  { label: 'Auth → Frontend (flip)',     source: isAuth,          target: isFrontend,      category: 'traffic', trafficType: 'data', lineStyle: 'solid', reverse: true },

  // ── TRAFFIC: publish / subscribe ───────────────────────────────────────
  { label: 'Backend → Queue (publish)',     source: isBackend,    target: isQueue,         category: 'traffic', trafficType: 'publish', lineStyle: 'dashed' },
  { label: 'Queue → Backend (subscribe)',   source: isQueue,      target: isBackend,       category: 'traffic', trafficType: 'subscribe', lineStyle: 'dotted' },
  { label: 'Backend → Warehouse',           source: isBackend,    target: isDataWarehouse,  category: 'traffic', trafficType: 'publish', lineStyle: 'dashed' },
  { label: 'Warehouse → Backend (flip)',    source: isDataWarehouse, target: isBackend,     category: 'traffic', trafficType: 'publish', lineStyle: 'dashed', reverse: true },

  // ── TRAFFIC: stream ────────────────────────────────────────────────────
  { label: 'Service → Monitoring',     source: (t) => !isMonitoring(t) && !isContainer(t), target: isMonitoring, category: 'traffic', trafficType: 'stream', lineStyle: 'thin' },

  // ── PIPELINE ───────────────────────────────────────────────────────────
  { label: 'Repo → Service',           source: isRepo,       target: isService,       category: 'pipeline', lineStyle: 'dashed' },
  // Reverse: user drags service→repo, we flip it to repo→service
  { label: 'Service → Repo (flip)',    source: isService,    target: isRepo,          category: 'pipeline', lineStyle: 'dashed', reverse: true },

  // ── CONFIG ─────────────────────────────────────────────────────────────
  { label: 'Service → EnvVars',        source: isService,    target: isEnvConfig,     category: 'config', lineStyle: 'dotted' },
  { label: 'Service → Secrets',        source: isService,    target: isSecrets,       category: 'config', lineStyle: 'dotted' },
  // Reverse: user drags envvars/secrets→service, we flip
  { label: 'EnvVars → Service (flip)', source: isEnvConfig,  target: isService,       category: 'config', lineStyle: 'dotted', reverse: true },
  { label: 'Secrets → Service (flip)', source: isSecrets,    target: isService,       category: 'config', lineStyle: 'dotted', reverse: true },

  // ── DNS ────────────────────────────────────────────────────────────────
  { label: 'Domain → Routable',        source: isDomain,     target: isRoutable,      category: 'dns', lineStyle: 'solid' },
  // Reverse: user drags service→domain, we flip
  { label: 'Routable → Domain (flip)', source: isRoutable,   target: isDomain,        category: 'dns', lineStyle: 'solid', reverse: true },
];

// ─── Derived Functions ──────────────────────────────────────────────────────

/**
 * Check if two block types can be connected.
 * Returns true if any CONNECTION_RULE matches (in either direction).
 */
export function canConnect(srcIceType: string, tgtIceType: string, srcNodeType?: string, tgtNodeType?: string): boolean {
  // Containers can never have edges
  if (isContainer(srcIceType, srcNodeType) || isContainer(tgtIceType, tgtNodeType)) return false;
  // Self-connection is never valid (checked at type level — same iceType is fine, same instance is caught elsewhere)
  return CONNECTION_RULES.some((r) => r.source(srcIceType) && r.target(tgtIceType));
}

/**
 * Find the matching rule for a source→target pair.
 * Returns the first matching rule, or null if no rule matches.
 */
export function findConnectionRule(srcIceType: string, tgtIceType: string): ConnectionRule | null {
  return CONNECTION_RULES.find((r) => r.source(srcIceType) && r.target(tgtIceType)) ?? null;
}

/**
 * Given a source iceType, return all node IDs from the provided list
 * that are valid connection targets.
 */
export function getValidTargetIds(
  srcIceType: string,
  srcNodeType: string | undefined,
  nodes: Array<{ id: string; iceType: string; nodeType?: string }>,
  srcId: string,
): string[] {
  if (isContainer(srcIceType, srcNodeType)) return [];
  return nodes
    .filter((n) => n.id !== srcId && canConnect(srcIceType, n.iceType, srcNodeType, n.nodeType))
    .map((n) => n.id);
}

// ─── Connection Inference ────────────────────────────────────────────────────

export function inferConnectionMeta(src: string, tgt: string): ConnectionMeta {
  const C = CATEGORY_COLORS;

  // Find matching rule
  const rule = findConnectionRule(src, tgt);

  if (rule) {
    const meta: ConnectionMeta = {
      category: rule.category,
      lineStyle: rule.lineStyle,
      color: C[rule.category],
      ...(rule.trafficType && { trafficType: rule.trafficType }),
      ...(rule.reverse && { flip: true }),
    };

    // Auto-inject port and env var from the "data target" side
    const dataTarget = rule.reverse ? src : tgt;
    const port = getDefaultPort(dataTarget);
    const envVar = getEnvVarName(dataTarget);
    if (port) meta.port = port;
    if (envVar) meta.envVarName = envVar;

    // Special case: cache always uses port 6379
    if (rule.trafficType === 'data' && isCache(dataTarget)) {
      meta.port = 6379;
    }

    return meta;
  }

  // Default fallback — still allow connection with generic traffic style
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
  // Group rules by category for readable output
  const grouped: Record<ConnectionCategory, ConnectionRule[]> = {
    traffic: [],
    pipeline: [],
    config: [],
    dns: [],
  };
  for (const rule of CONNECTION_RULES) {
    if (!rule.reverse) grouped[rule.category].push(rule);
  }

  return `## CONNECTION CATEGORIES

Every connection falls into one of 4 categories. The category is auto-determined from block types — set the correct "relationship" value in addEdge.

### TRAFFIC (green) — runtime network flow between services
relationship: "connects_to"
Valid connections:
${grouped.traffic.map((r) => `- ${r.label} (${r.trafficType || 'request'}, ${r.lineStyle} line)`).join('\n')}

### PIPELINE (purple) — code deployment
relationship: "connects_to"
${grouped.pipeline.map((r) => `- ${r.label}`).join('\n')}
Direction: ALWAYS repo → service (never service → repo)

### CONFIG (amber) — deploy-time configuration
relationship: "depends_on"
${grouped.config.map((r) => `- ${r.label}`).join('\n')}
Direction: ALWAYS service → config block (never config → service)

### DNS (cyan) — domain routing
relationship: "connects_to"
${grouped.dns.map((r) => `- ${r.label}`).join('\n')}
Direction: ALWAYS domain → service (never service → domain)

### CONTAINERS CANNOT HAVE EDGES
VPC, Subnet, and Group nodes are CONTAINERS. They hold resources via parentId.
NEVER create addEdge with source or target pointing to a VPC, Subnet, or Group.

### Auto-generated env vars
When a service connects to a data store, an env var is auto-injected:
${Object.entries(DEFAULT_ENV_VARS)
  .map(([k, v]) => `- ${k} → ${v}`)
  .join('\n')}

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
