/**
 * AST — Base node interface + the AstNodeKind union.
 *
 * Every other AST type extends `AstNode`; the union of all kinds is
 * the discriminator that `is_node_kind` in `../helpers.ts` narrows on.
 *
 * Extracted from `ast/types.ts` in rf-asttyp-1.
 */

import type { SourceSpan } from '../../tokens.js';

// =============================================================================
// Base AST Node
// =============================================================================

/**
 * Base interface for all AST nodes.
 */
export interface AstNode {
  /** Node type discriminator */
  readonly kind: AstNodeKind;

  /** Source location */
  readonly span: SourceSpan;
}

/**
 * All AST node kinds.
 */
export type AstNodeKind =
  // Top-level
  | 'Program'
  | 'ResourceBlock'
  | 'DataBlock'
  | 'VariableBlock'
  | 'OutputBlock'
  | 'ProviderBlock'
  | 'ModuleBlock'
  | 'LocalsBlock'
  | 'ImportStatement'

  // Expressions
  | 'Identifier'
  | 'TypeIdentifier'
  | 'StringLiteral'
  | 'NumberLiteral'
  | 'BooleanLiteral'
  | 'NullLiteral'
  | 'ArrayExpression'
  | 'ObjectExpression'
  | 'PropertyAccess'
  | 'IndexAccess'
  | 'FunctionCall'
  | 'BinaryExpression'
  | 'UnaryExpression'
  | 'ConditionalExpression'
  | 'ForExpression'
  | 'Interpolation'
  | 'Reference'
  | 'SplatExpression'

  // Other
  | 'Property'
  | 'Block'
  | 'Attribute';
