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
 * Architecture: a declarative `CONNECTION_RULES` array (in
 * `./connection-rules/rules-data.ts`) defines every valid source→target
 * pair. The classifier predicates live in `./connection-rules/predicates`,
 * the type surface in `./connection-rules/types`. This file is the
 * orchestrator: it re-exports the public API (`isX`, types,
 * `CONNECTION_RULES`, `generateAiConnectionPrompt`) AND owns the
 * derived helpers (`canConnect`, `validateConnection`, `wouldCreateCycle`,
 * `inferConnectionMeta`, ...) — the small set of functions that compose
 * the rules + predicates into the call surface every consumer touches.
 */

import {
  type ConnectionCategory,
  CATEGORY_COLORS,
  CATEGORY_TO_RELATIONSHIP,
  DEFAULT_PORTS,
  DEFAULT_ENV_VARS,
} from '@ice/constants';
import type {
  ConnectionMeta,
  ConnectionWarning,
  ConnectionRule,
  NodeForConnectionCheck,
} from './connection-rules/types';
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
} from './connection-rules/predicates';
import { CONNECTION_RULES, generateAiConnectionPrompt } from './connection-rules/rules-data';

// ─── Public re-exports ──────────────────────────────────────────────────────

export { type ConnectionCategory, CATEGORY_COLORS, CATEGORY_TO_RELATIONSHIP };

export type {
  TrafficType,
  LineStyle,
  ConnectionMeta,
  ConnectionWarning,
  ConnectionRule,
  NodeForConnectionCheck,
} from './connection-rules/types';

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

export { CONNECTION_RULES, generateAiConnectionPrompt };

// ─── Default Port / Env Var Lookup ──────────────────────────────────────────

export function getDefaultPort(iceType: string): number | undefined {
  return DEFAULT_PORTS[iceType];
}

export function getEnvVarName(iceType: string): string | undefined {
  return DEFAULT_ENV_VARS[iceType];
}

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
