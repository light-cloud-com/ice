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
import type {
  TrafficType,
  LineStyle,
  ConnectionMeta,
  ConnectionWarning,
  ConnectionRule,
  NodeForConnectionCheck,
} from './connection-rules/types';

export { type ConnectionCategory, CATEGORY_COLORS, CATEGORY_TO_RELATIONSHIP };

// ─── Core Types — re-exported from ./connection-rules/types ─────────────────

export type {
  TrafficType,
  LineStyle,
  ConnectionMeta,
  ConnectionWarning,
  ConnectionRule,
  NodeForConnectionCheck,
} from './connection-rules/types';

// ─── Block Type Classification ───────────────────────────────────────────────
// Predicates re-exported from `./connection-rules/predicates` (rf-conn-2).
// They classify iceType strings into logical groups; the CONNECTION_RULES
// array below composes them into source/target classifiers.

import {
  isDatabase,
  isCache,
  isQueue,
  isStorage,
  isBackend,
  isFrontend,
  isGateway,
  isAuth,
  isSecrets,
  isMonitoring,
  isSearch,
  isDataWarehouse,
  isVectorDb,
  isLLM,
  isRepo,
  isEnvConfig,
  isDomain,
  isCustomDomain,
  isPrivateNetwork,
  isContainer,
  isService,
  isRoutable,
} from './connection-rules/predicates';

export {
  isDatabase,
  isCache,
  isQueue,
  isStorage,
  isBackend,
  isFrontend,
  isGateway,
  isAuth,
  isSecrets,
  isMonitoring,
  isSearch,
  isDataWarehouse,
  isVectorDb,
  isLLM,
  isRepo,
  isEnvConfig,
  isDomain,
  isCustomDomain,
  isPrivateNetwork,
  isContainer,
};

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

export const CONNECTION_RULES: ConnectionRule[] = [
  // ── TRAFFIC: request ────────────────────────────────────────────────────
  {
    label: 'Frontend → Backend',
    source: isFrontend,
    target: isBackend,
    category: 'traffic',
    trafficType: 'request',
    lineStyle: 'solid',
  },
  {
    label: 'Gateway → Gateway',
    source: isGateway,
    target: isGateway,
    category: 'traffic',
    trafficType: 'request',
    lineStyle: 'solid',
  },
  {
    label: 'Gateway → Backend',
    source: isGateway,
    target: isBackend,
    category: 'traffic',
    trafficType: 'request',
    lineStyle: 'solid',
  },
  {
    label: 'Gateway → Frontend',
    source: isGateway,
    target: isFrontend,
    category: 'traffic',
    trafficType: 'request',
    lineStyle: 'solid',
  },
  {
    label: 'Backend → Backend',
    source: isBackend,
    target: isBackend,
    category: 'traffic',
    trafficType: 'request',
    lineStyle: 'solid',
  },
  {
    label: 'Backend → Auth',
    source: isBackend,
    target: isAuth,
    category: 'traffic',
    trafficType: 'request',
    lineStyle: 'solid',
  },
  {
    label: 'Frontend → Auth',
    source: isFrontend,
    target: isAuth,
    category: 'traffic',
    trafficType: 'request',
    lineStyle: 'solid',
  },
  {
    label: 'Frontend → Gateway',
    source: isFrontend,
    target: isGateway,
    category: 'traffic',
    trafficType: 'request',
    lineStyle: 'solid',
  },

  // ── TRAFFIC: data ──────────────────────────────────────────────────────
  {
    label: 'Backend → Database',
    source: isBackend,
    target: isDatabase,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
  },
  {
    label: 'Backend → Cache',
    source: isBackend,
    target: isCache,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
  },
  {
    label: 'Backend → Storage',
    source: isBackend,
    target: isStorage,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
  },
  {
    label: 'Backend → Search',
    source: isBackend,
    target: isSearch,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
  },
  {
    label: 'Backend → VectorDB',
    source: isBackend,
    target: isVectorDb,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
  },
  {
    label: 'Backend → LLM',
    source: isBackend,
    target: isLLM,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
  },
  {
    label: 'Frontend → Storage',
    source: isFrontend,
    target: isStorage,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
  },

  // ── TRAFFIC: data (reverse — drag from data store to service) ──────────
  {
    label: 'Database → Backend (flip)',
    source: isDatabase,
    target: isBackend,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
    reverse: true,
  },
  {
    label: 'Cache → Backend (flip)',
    source: isCache,
    target: isBackend,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
    reverse: true,
  },
  {
    label: 'Storage → Backend (flip)',
    source: isStorage,
    target: isBackend,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
    reverse: true,
  },
  {
    label: 'Storage → Frontend (flip)',
    source: isStorage,
    target: isFrontend,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
    reverse: true,
  },
  {
    label: 'Search → Backend (flip)',
    source: isSearch,
    target: isBackend,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
    reverse: true,
  },
  {
    label: 'VectorDB → Backend (flip)',
    source: isVectorDb,
    target: isBackend,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
    reverse: true,
  },
  {
    label: 'LLM → Backend (flip)',
    source: isLLM,
    target: isBackend,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
    reverse: true,
  },
  {
    label: 'Auth → Backend (flip)',
    source: isAuth,
    target: isBackend,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
    reverse: true,
  },
  {
    label: 'Auth → Frontend (flip)',
    source: isAuth,
    target: isFrontend,
    category: 'traffic',
    trafficType: 'data',
    lineStyle: 'solid',
    reverse: true,
  },

  // ── TRAFFIC: publish / subscribe ───────────────────────────────────────
  {
    label: 'Backend → Queue (publish)',
    source: isBackend,
    target: isQueue,
    category: 'traffic',
    trafficType: 'publish',
    lineStyle: 'dashed',
  },
  {
    label: 'Queue → Backend (subscribe)',
    source: isQueue,
    target: isBackend,
    category: 'traffic',
    trafficType: 'subscribe',
    lineStyle: 'dotted',
  },
  {
    label: 'Backend → Warehouse',
    source: isBackend,
    target: isDataWarehouse,
    category: 'traffic',
    trafficType: 'publish',
    lineStyle: 'dashed',
  },
  {
    label: 'Warehouse → Backend (flip)',
    source: isDataWarehouse,
    target: isBackend,
    category: 'traffic',
    trafficType: 'publish',
    lineStyle: 'dashed',
    reverse: true,
  },

  // ── TRAFFIC: stream ────────────────────────────────────────────────────
  {
    label: 'Service → Monitoring',
    source: (t) => !isMonitoring(t) && !isContainer(t),
    target: isMonitoring,
    category: 'traffic',
    trafficType: 'stream',
    lineStyle: 'thin',
  },

  // ── PIPELINE ───────────────────────────────────────────────────────────
  { label: 'Repo → Service', source: isRepo, target: isService, category: 'pipeline', lineStyle: 'dashed' },
  // Reverse: user drags service→repo, we flip it to repo→service
  {
    label: 'Service → Repo (flip)',
    source: isService,
    target: isRepo,
    category: 'pipeline',
    lineStyle: 'dashed',
    reverse: true,
  },

  // ── CONFIG ─────────────────────────────────────────────────────────────
  { label: 'Service → EnvVars', source: isService, target: isEnvConfig, category: 'config', lineStyle: 'dotted' },
  { label: 'Service → Secrets', source: isService, target: isSecrets, category: 'config', lineStyle: 'dotted' },
  // Reverse: user drags envvars/secrets→service, we flip
  {
    label: 'EnvVars → Service (flip)',
    source: isEnvConfig,
    target: isService,
    category: 'config',
    lineStyle: 'dotted',
    reverse: true,
  },
  {
    label: 'Secrets → Service (flip)',
    source: isSecrets,
    target: isService,
    category: 'config',
    lineStyle: 'dotted',
    reverse: true,
  },

  // ── DNS ────────────────────────────────────────────────────────────────
  { label: 'Domain → Routable', source: isDomain, target: isRoutable, category: 'dns', lineStyle: 'solid' },
  // Reverse: user drags service→domain, we flip
  {
    label: 'Routable → Domain (flip)',
    source: isRoutable,
    target: isDomain,
    category: 'dns',
    lineStyle: 'solid',
    reverse: true,
  },
];

// ─── Derived Functions ──────────────────────────────────────────────────────

/**
 * Walk a node's parent chain looking for a container iceType (VPC,
 * Subnet, or any Group.*). Returns true if any ancestor is a container.
 * Used by parent-aware rules like "Public Traffic can only target
 * non-VPC services."
 */
export function isInsideContainer(nodeId: string, allNodes: NodeForConnectionCheck[]): boolean {
  const byId = new Map(allNodes.map((n) => [n.id, n]));
  let cur = byId.get(nodeId);
  let depth = 0;
  while (cur?.parentId && depth < 20) {
    const parent = byId.get(cur.parentId);
    if (!parent) return false;
    const pIce = (parent.data?.iceType as string) || '';
    if (isContainer(pIce, parent.type)) return true;
    cur = parent;
    depth++;
  }
  return false;
}

/**
 * Check if two block types can be connected.
 * Returns true if any CONNECTION_RULE matches (in either direction).
 *
 * The optional `context` parameter unlocks parent-aware rules. Without
 * it, only iceType-level checks run (which is fine for the AI assistant,
 * type discovery, etc. that don't have a canvas to inspect). The svg
 * canvas drag-handler passes context so it can enforce "Public Traffic
 * blocks can only connect to publicly-facing services" — i.e. targets
 * NOT inside a VPC subnet.
 */
export function canConnect(
  srcIceType: string,
  tgtIceType: string,
  srcNodeType?: string,
  tgtNodeType?: string,
  context?: {
    srcNode?: NodeForConnectionCheck;
    tgtNode?: NodeForConnectionCheck;
    allNodes?: NodeForConnectionCheck[];
  },
): boolean {
  // Containers can never have edges (VPC, Subnet, PrivateNetwork, Group.*).
  if (isContainer(srcIceType, srcNodeType) || isContainer(tgtIceType, tgtNodeType)) return false;

  // Custom Domain blocks are pure DNS at the top level — they can't
  // penetrate a VPC. Reject Custom Domain → VPC-internal targets in
  // both directions, UNLESS the CD is nested inside the same container
  // as the target (e.g. CD inside a PrivateNetwork targeting sibling
  // services — the compiler synthesizes the LB in that case).
  //
  // Skipped if context isn't provided (callers without canvas state are
  // non-authoritative on parent topology).
  if (context?.allNodes && context.allNodes.length > 0) {
    if (isCustomDomain(srcIceType) && context.srcNode && context.tgtNode) {
      const srcParent = context.srcNode.parentId || null;
      const tgtParent = context.tgtNode.parentId || null;
      // Allow nested CD → sibling inside the same PrivateNetwork.
      const sameParentNetwork = !!srcParent && srcParent === tgtParent;
      if (!sameParentNetwork && isInsideContainer(context.tgtNode.id, context.allNodes)) {
        return false;
      }
    }
    if (isCustomDomain(tgtIceType) && context.srcNode && context.tgtNode) {
      const srcParent = context.srcNode.parentId || null;
      const tgtParent = context.tgtNode.parentId || null;
      const sameParentNetwork = !!tgtParent && srcParent === tgtParent;
      if (!sameParentNetwork && isInsideContainer(context.srcNode.id, context.allNodes)) {
        return false;
      }
    }
  }

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
