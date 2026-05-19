/**
 * AST — Block / Attribute / NestedBlock.
 *
 * The structural building block: a `Block` holds attribute
 * assignments and nested blocks (the latter is the only non-AstNode
 * type in the AST surface). Used by every top-level statement that
 * carries a body (resource, data, provider, module).
 *
 * Extracted from `ast/types.ts` in rf-asttyp-1.
 */

import type { AstNode } from './base';
import type { Expression, Identifier } from './expressions';

// =============================================================================
// Block
// =============================================================================

/**
 * Block containing attributes and nested blocks.
 */
export interface Block extends AstNode {
  readonly kind: 'Block';
  readonly attributes: Attribute[];
  readonly blocks: NestedBlock[];
}

/**
 * Attribute assignment.
 */
export interface Attribute extends AstNode {
  readonly kind: 'Attribute';
  readonly name: Identifier;
  readonly value: Expression;
}

/**
 * Nested block.
 */
export interface NestedBlock {
  readonly type: string;
  readonly labels: string[];
  readonly body: Block;
}
