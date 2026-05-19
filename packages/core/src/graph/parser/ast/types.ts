/**
 * Abstract Syntax Tree — Type Definitions (re-export shim)
 *
 * AST node interface declarations for the ICE language. The set is
 * frozen here; the helpers (`is_node_kind`, `create_span`, `visit_ast`)
 * live in `./helpers.ts`. Originally extracted from `parser/ast.ts` in
 * rf-ast-1; further split by category in rf-asttyp-1:
 *
 *   - `./types/base.ts`        — AstNode, AstNodeKind union
 *   - `./types/expressions.ts` — Expression union + literals + access +
 *                                 splat + for-comprehension types
 *   - `./types/blocks.ts`      — Block, Attribute, NestedBlock
 *   - `./types/statements.ts`  — Program + Statement union + every
 *                                 top-level block (resource/data/
 *                                 variable/output/provider/module/
 *                                 locals/import) + LifecycleConfig +
 *                                 ValidationRule + TypeExpression
 *
 * This file is a re-export shim. The original `ast.ts` is kept as its
 * own re-export shim at `../ast.ts`. Both are public-API surfaces;
 * every existing consumer keeps importing from `'../ast/types.js'` or
 * `'../ast.js'` unchanged. The sub-files exist to keep the file-size
 * ceiling and the per-category narrative readable.
 */

export type { AstNode, AstNodeKind } from './types/base';
export type {
  Block,
  Attribute,
  NestedBlock,
} from './types/blocks';
export type {
  Expression,
  Identifier,
  TypeIdentifier,
  StringLiteral,
  NumberLiteral,
  BooleanLiteral,
  NullLiteral,
  ArrayExpression,
  ObjectExpression,
  ObjectProperty,
  PropertyAccess,
  IndexAccess,
  FunctionCall,
  BinaryOperator,
  BinaryExpression,
  UnaryOperator,
  UnaryExpression,
  ConditionalExpression,
  ForExpression,
  Interpolation,
  Reference,
  SplatExpression,
} from './types/expressions';
export type {
  Program,
  Statement,
  ResourceBlock,
  LifecycleConfig,
  DataBlock,
  VariableBlock,
  ValidationRule,
  TypeExpression,
  OutputBlock,
  ProviderBlock,
  ModuleBlock,
  LocalsBlock,
  ImportStatement,
} from './types/statements';
