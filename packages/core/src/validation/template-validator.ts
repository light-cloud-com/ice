/**
 * Template Validation
 *
 * Validates ComposedTemplate definitions for correctness:
 * - Block iceTypes resolve to known blueprints
 * - Connection indices are in bounds
 * - Group blockIndices are in bounds
 * - Group parent ordering is correct
 * - Connection pairs follow CONNECTION_RULES
 */

import { canConnect } from './classifiers';
import { isKnownIceType } from './schema-bridge';
import type { CanvasIssue } from './types';

// Minimal template shape — avoids importing @ice/templates types
interface TemplateBlock {
  iceType: string;
  label: string;
  position: { x: number; y: number };
}

interface TemplateConnection {
  fromBlock: number;
  toBlock: number;
  relationship: string;
}

interface TemplateGroup {
  subtype: string;
  iceType?: string;
  label: string;
  blockIndices: number[];
  parentGroupIndex?: number;
}

interface TemplateInput {
  id: string;
  name: string;
  blocks: TemplateBlock[];
  connections: TemplateConnection[];
  groups?: TemplateGroup[];
}

/**
 * Validate a composed template definition.
 * Returns issues using the same CanvasIssue type for consistency.
 */
export function validateTemplate(template: TemplateInput): CanvasIssue[] {
  const issues: CanvasIssue[] = [];
  const blockCount = template.blocks.length;
  const groupCount = template.groups?.length ?? 0;

  // ── Block iceType validity ──────────────────────────────────────────
  for (let i = 0; i < blockCount; i++) {
    const block = template.blocks[i]!;
    if (!isKnownIceType(block.iceType)) {
      issues.push({
        id: `tpl:${template.id}:block:${i}:unknown_type`,
        severity: 'error',
        category: 'structure',
        code: 'MISSING_ICE_TYPE',
        message: `Template "${template.name}" block[${i}] has unknown iceType "${block.iceType}"`,
      });
    }
  }

  // ── Connection index bounds ─────────────────────────────────────────
  for (let i = 0; i < template.connections.length; i++) {
    const conn = template.connections[i]!;

    if (conn.fromBlock < 0 || conn.fromBlock >= blockCount) {
      issues.push({
        id: `tpl:${template.id}:conn:${i}:from_oob`,
        severity: 'error',
        category: 'structure',
        code: 'DANGLING_EDGE_SOURCE',
        message: `Template "${template.name}" connection[${i}].fromBlock=${conn.fromBlock} is out of bounds (${blockCount} blocks)`,
      });
    }

    if (conn.toBlock < 0 || conn.toBlock >= blockCount) {
      issues.push({
        id: `tpl:${template.id}:conn:${i}:to_oob`,
        severity: 'error',
        category: 'structure',
        code: 'DANGLING_EDGE_TARGET',
        message: `Template "${template.name}" connection[${i}].toBlock=${conn.toBlock} is out of bounds (${blockCount} blocks)`,
      });
    }

    // Self-connection
    if (conn.fromBlock === conn.toBlock) {
      issues.push({
        id: `tpl:${template.id}:conn:${i}:self`,
        severity: 'error',
        category: 'connection',
        code: 'SELF_CONNECTION',
        message: `Template "${template.name}" connection[${i}] connects block to itself`,
      });
    }

    // Connection rule validity
    if (
      conn.fromBlock >= 0 &&
      conn.fromBlock < blockCount &&
      conn.toBlock >= 0 &&
      conn.toBlock < blockCount &&
      conn.fromBlock !== conn.toBlock
    ) {
      const srcBlock = template.blocks[conn.fromBlock];
      const tgtBlock = template.blocks[conn.toBlock];
      if (srcBlock && tgtBlock && !canConnect(srcBlock.iceType, tgtBlock.iceType)) {
        issues.push({
          id: `tpl:${template.id}:conn:${i}:invalid_pair`,
          severity: 'warning',
          category: 'connection',
          code: 'INVALID_CONNECTION',
          message: `Template "${template.name}" connection ${srcBlock.iceType} → ${tgtBlock.iceType} is not a valid pair`,
        });
      }
    }
  }

  // ── Group validation ────────────────────────────────────────────────
  if (template.groups) {
    for (let i = 0; i < groupCount; i++) {
      const group = template.groups[i]!;

      // Block indices in bounds
      for (const blockIdx of group.blockIndices) {
        if (blockIdx < 0 || blockIdx >= blockCount) {
          issues.push({
            id: `tpl:${template.id}:group:${i}:block_oob:${blockIdx}`,
            severity: 'error',
            category: 'structure',
            code: 'INVALID_PARENT_REF',
            message: `Template "${template.name}" group "${group.label}" references block[${blockIdx}] which is out of bounds`,
          });
        }
      }

      // Parent group ordering: parent must come before child
      if (group.parentGroupIndex !== undefined) {
        if (group.parentGroupIndex < 0 || group.parentGroupIndex >= groupCount) {
          issues.push({
            id: `tpl:${template.id}:group:${i}:parent_oob`,
            severity: 'error',
            category: 'structure',
            code: 'INVALID_PARENT_REF',
            message: `Template "${template.name}" group "${group.label}" references non-existent parent group[${group.parentGroupIndex}]`,
          });
        } else if (group.parentGroupIndex >= i) {
          issues.push({
            id: `tpl:${template.id}:group:${i}:parent_after_child`,
            severity: 'error',
            category: 'structure',
            code: 'INVALID_PARENT_REF',
            message: `Template "${template.name}" group "${group.label}" references parent group[${group.parentGroupIndex}] which appears after it — parents must come first`,
          });
        }
      }
    }
  }

  return issues;
}
