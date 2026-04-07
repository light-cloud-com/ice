/**
 * Architecture Validation Rules
 *
 * Best practices and anti-pattern detection:
 * - Frontend without backend
 * - No auth for production
 * - No monitoring attached
 * - Public services without SSL
 * - Multiple databases without cache
 */

import {
  isBackend,
  isFrontend,
  isDatabase,
  isCache,
  isAuth,
  isMonitoring,
  isDomain,
  isContainer,
  isGateway,
} from './classifiers.js';
import type { CanvasIssue, ValidatableNode, ValidatableEdge, ValidationContext } from './types.js';

/**
 * Validate architectural patterns and best practices.
 */
export function validateArchitecture(
  nodes: readonly ValidatableNode[],
  edges: readonly ValidatableEdge[],
  ctx: ValidationContext,
): CanvasIssue[] {
  const issues: CanvasIssue[] = [];

  // Build adjacency for quick lookups
  const nodeMap = new Map<string, ValidatableNode>();
  const outgoing = new Map<string, Set<string>>(); // nodeId → set of target nodeIds
  const incoming = new Map<string, Set<string>>(); // nodeId → set of source nodeIds

  for (const n of nodes) nodeMap.set(n.id, n);
  for (const e of edges) {
    if (e.data?.relationship === 'contains') continue;
    if (!outgoing.has(e.source)) outgoing.set(e.source, new Set());
    if (!incoming.has(e.target)) incoming.set(e.target, new Set());
    outgoing.get(e.source)!.add(e.target);
    incoming.get(e.target)!.add(e.source);
  }

  // Classify nodes
  const frontends: ValidatableNode[] = [];
  const backends: ValidatableNode[] = [];
  const databases: ValidatableNode[] = [];
  const caches: ValidatableNode[] = [];
  let hasAuth = false;
  let hasMonitoring = false;
  let hasDomain = false;

  for (const node of nodes) {
    const t = (node.data.iceType as string) ?? '';
    if (isContainer(t, node.type)) continue;

    if (isFrontend(t)) frontends.push(node);
    else if (isBackend(t)) backends.push(node);
    else if (isDatabase(t)) databases.push(node);
    else if (isCache(t)) caches.push(node);

    if (isAuth(t)) hasAuth = true;
    if (isMonitoring(t)) hasMonitoring = true;
    if (isDomain(t)) hasDomain = true;
  }

  // ── Frontend without any backend ────────────────────────────────────
  for (const fe of frontends) {
    const targets = outgoing.get(fe.id);
    const hasBackendConnection =
      targets &&
      [...targets].some((tId) => {
        const t = nodeMap.get(tId);
        return t && isBackend((t.data.iceType as string) ?? '');
      });
    const hasGatewayConnection =
      targets &&
      [...targets].some((tId) => {
        const t = nodeMap.get(tId);
        return t && isGateway((t.data.iceType as string) ?? '');
      });

    if (!hasBackendConnection && !hasGatewayConnection && backends.length === 0) {
      issues.push({
        id: `arch:${fe.id}:NO_BACKEND_FOR_FRONTEND`,
        severity: 'info',
        category: 'architecture',
        code: 'NO_BACKEND_FOR_FRONTEND',
        message: `"${(fe.data.label as string) || 'Frontend'}" has no backend — is this a static-only site?`,
        nodeId: fe.id,
        suggestion: 'If it needs an API, add a Backend API and connect them',
      });
    }
  }

  // ── Production checks ───────────────────────────────────────────────
  if (ctx.environment === 'production') {
    // No auth in production
    if (!hasAuth && backends.length > 0) {
      issues.push({
        id: 'arch:NO_AUTH_PRODUCTION',
        severity: 'warning',
        category: 'architecture',
        code: 'NO_AUTH_PRODUCTION',
        message: 'No authentication service in production setup',
        suggestion: 'Add an Auth / Identity resource to secure your APIs',
      });
    }

    // No monitoring in production
    if (!hasMonitoring && backends.length + frontends.length > 0) {
      issues.push({
        id: 'arch:NO_MONITORING',
        severity: 'info',
        category: 'architecture',
        code: 'NO_MONITORING',
        message: 'No monitoring or logging in production',
        suggestion: 'Add a Log resource to track errors and performance',
      });
    }

    // Public service without SSL/domain
    if (!hasDomain && frontends.length > 0) {
      issues.push({
        id: 'arch:NO_SSL_PUBLIC',
        severity: 'info',
        category: 'architecture',
        code: 'NO_SSL_PUBLIC',
        message: 'No custom domain configured for production',
        suggestion: 'Add a Domain resource for a professional URL and SSL',
      });
    }
  }

  // ── Multiple databases without cache ────────────────────────────────
  if (databases.length >= 2 && caches.length === 0 && backends.length > 0) {
    issues.push({
      id: 'arch:MULTI_DB_NO_CACHE',
      severity: 'info',
      category: 'architecture',
      code: 'MULTI_DB_NO_CACHE',
      message: `${databases.length} databases with no cache layer`,
      suggestion: 'Consider adding Redis for frequently accessed data',
    });
  }

  return issues;
}
