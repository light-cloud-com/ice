/**
 * Structure Validation Rules
 *
 * Validates canvas structural integrity:
 * - Node ID uniqueness
 * - Edge source/target references
 * - Parent-child containment hierarchy
 * - Missing iceType on resource nodes
 * - Orphan detection
 */

import { isContainer } from './classifiers.js';
import type { CanvasIssue, ValidatableNode, ValidatableEdge } from './types.js';

/**
 * Validate structural integrity of the canvas.
 */
export function validateStructure(
  nodes: readonly ValidatableNode[],
  edges: readonly ValidatableEdge[],
): CanvasIssue[] {
  const issues: CanvasIssue[] = [];
  const nodeIds = new Set<string>();
  const nodeMap = new Map<string, ValidatableNode>();

  // ── Duplicate node IDs ──────────────────────────────────────────────
  for (const node of nodes) {
    if (nodeIds.has(node.id)) {
      issues.push({
        id: `struct:${node.id}:DUPLICATE_NODE_ID`,
        severity: 'error',
        category: 'structure',
        code: 'DUPLICATE_NODE_ID',
        message: `Duplicate node ID: ${node.id}`,
        nodeId: node.id,
      });
    }
    nodeIds.add(node.id);
    nodeMap.set(node.id, node);
  }

  // ── Missing iceType on resource nodes ───────────────────────────────
  for (const node of nodes) {
    const iceType = node.data.iceType as string | undefined;
    if (!iceType && (node.type === 'resource' || node.type === 'block')) {
      issues.push({
        id: `struct:${node.id}:MISSING_ICE_TYPE`,
        severity: 'warning',
        category: 'structure',
        code: 'MISSING_ICE_TYPE',
        message: 'Resource node is missing an iceType',
        nodeId: node.id,
      });
    }
  }

  // ── Parent containment ──────────────────────────────────────────────
  for (const node of nodes) {
    if (!node.parentId) continue;

    const parent = nodeMap.get(node.parentId);
    if (!parent) {
      issues.push({
        id: `struct:${node.id}:INVALID_PARENT_REF`,
        severity: 'error',
        category: 'structure',
        code: 'INVALID_PARENT_REF',
        message: `Parent "${node.parentId}" does not exist`,
        nodeId: node.id,
      });
      continue;
    }

    const parentIceType = parent.data.iceType as string ?? '';
    if (!isContainer(parentIceType, parent.type) && parent.type !== 'container' && parent.type !== 'group') {
      issues.push({
        id: `struct:${node.id}:PARENT_NOT_CONTAINER`,
        severity: 'error',
        category: 'structure',
        code: 'PARENT_NOT_CONTAINER',
        message: `Parent "${(parent.data.label as string) || parent.id}" is not a container`,
        nodeId: node.id,
        suggestion: 'Resources can only be placed inside VPC, Subnet, or Group containers',
      });
    }
  }

  // ── Edge references ─────────────────────────────────────────────────
  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      issues.push({
        id: `struct:${edge.id}:DANGLING_EDGE_SOURCE`,
        severity: 'error',
        category: 'structure',
        code: 'DANGLING_EDGE_SOURCE',
        message: `Edge source "${edge.source}" does not exist`,
        edgeId: edge.id,
      });
    }
    if (!nodeIds.has(edge.target)) {
      issues.push({
        id: `struct:${edge.id}:DANGLING_EDGE_TARGET`,
        severity: 'error',
        category: 'structure',
        code: 'DANGLING_EDGE_TARGET',
        message: `Edge target "${edge.target}" does not exist`,
        edgeId: edge.id,
      });
    }
  }

  // ── Orphan nodes (no connections) ───────────────────────────────────
  // Only flag resource nodes, not containers or special types
  const connectedNodes = new Set<string>();
  for (const edge of edges) {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  }
  // Also count parentId as a connection (containment)
  for (const node of nodes) {
    if (node.parentId) {
      connectedNodes.add(node.id);
      connectedNodes.add(node.parentId);
    }
  }

  for (const node of nodes) {
    const iceType = node.data.iceType as string ?? '';
    // Skip containers, groups, monitoring (often standalone), domain, env config
    if (isContainer(iceType, node.type)) continue;
    if (node.type === 'container' || node.type === 'group') continue;
    if (iceType === 'Config.Environment' || iceType === 'Network.Domain') continue;
    if (iceType.startsWith('Monitoring.')) continue;

    if (!connectedNodes.has(node.id)) {
      issues.push({
        id: `struct:${node.id}:ORPHAN_NODE`,
        severity: 'info',
        category: 'structure',
        code: 'ORPHAN_NODE',
        message: `"${(node.data.label as string) || iceType}" has no connections`,
        nodeId: node.id,
        suggestion: 'Connect this resource to other services or remove it',
      });
    }
  }

  return issues;
}
