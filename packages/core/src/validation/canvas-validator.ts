/**
 * Canvas Validator — Unified Entry Point
 *
 * Orchestrates all validation rule modules against canvas data.
 * Pure, synchronous function — safe to call on every canvas change.
 *
 * Usage:
 *   const result = validateCanvas(nodes, edges, { mode: 'design' });
 *   const result = validateCanvas(nodes, edges, { mode: 'pre-deploy', provider: 'aws' });
 */

import { validateProperties } from './property-rules.js';
import { validateConnections } from './connection-rules.js';
import { validateStructure } from './structure-rules.js';
import { validateDeployability } from './deploy-rules.js';
import { validateArchitecture } from './architecture-rules.js';
import type {
  CanvasIssue,
  CanvasValidationResult,
  ValidatableNode,
  ValidatableEdge,
  ValidationContext,
} from './types.js';

/**
 * Validate an entire canvas (nodes + edges).
 *
 * @param nodes — Canvas nodes (CardNode[] from Redux or API)
 * @param edges — Canvas edges (CardEdge[] from Redux or API)
 * @param ctx   — Validation context (mode, provider, environment)
 * @returns     — Full validation result with issues mapped to node/edge IDs
 */
export function validateCanvas(
  nodes: readonly ValidatableNode[],
  edges: readonly ValidatableEdge[],
  ctx: ValidationContext = { mode: 'design' },
): CanvasValidationResult {
  const issues: CanvasIssue[] = [];

  // ── Always run: structural integrity ────────────────────────────────
  issues.push(...validateStructure(nodes, edges));

  // ── Always run: property validation ─────────────────────────────────
  issues.push(...validateProperties(nodes, ctx));

  // ── Always run: connection validation ───────────────────────────────
  issues.push(...validateConnections(nodes, edges, ctx));

  // ── Pre-deploy only: deployability checks ───────────────────────────
  if (ctx.mode === 'pre-deploy') {
    issues.push(...validateDeployability(nodes, edges, ctx));
    issues.push(...validateArchitecture(nodes, edges, ctx));
  }

  return buildResult(issues);
}

/**
 * Validate a single node's properties (for real-time field-level feedback).
 * Lighter than full canvas validation.
 */
export function validateNode(
  node: ValidatableNode,
  ctx: ValidationContext = { mode: 'design' },
): CanvasIssue[] {
  return validateProperties([node], ctx);
}

// ─── Result Builder ─────────────────────────────────────────────────────────

function buildResult(issues: CanvasIssue[]): CanvasValidationResult {
  // Deduplicate by issue ID
  const seen = new Set<string>();
  const deduped: CanvasIssue[] = [];
  for (const issue of issues) {
    if (!seen.has(issue.id)) {
      seen.add(issue.id);
      deduped.push(issue);
    }
  }

  const errors = deduped.filter(i => i.severity === 'error');
  const warnings = deduped.filter(i => i.severity === 'warning');
  const info = deduped.filter(i => i.severity === 'info');

  // Group by node
  const issuesByNode = new Map<string, CanvasIssue[]>();
  for (const issue of deduped) {
    if (issue.nodeId) {
      if (!issuesByNode.has(issue.nodeId)) issuesByNode.set(issue.nodeId, []);
      issuesByNode.get(issue.nodeId)!.push(issue);
    }
  }

  // Group by edge
  const issuesByEdge = new Map<string, CanvasIssue[]>();
  for (const issue of deduped) {
    if (issue.edgeId) {
      if (!issuesByEdge.has(issue.edgeId)) issuesByEdge.set(issue.edgeId, []);
      issuesByEdge.get(issue.edgeId)!.push(issue);
    }
  }

  const hasDeployErrors = errors.some(e => e.category === 'deploy');

  return {
    valid: errors.length === 0,
    deployable: errors.length === 0 && !hasDeployErrors,
    issues: deduped,
    issuesByNode,
    issuesByEdge,
    summary: {
      errors: errors.length,
      warnings: warnings.length,
      info: info.length,
    },
    validatedAt: new Date().toISOString(),
  };
}
