/**
 * Abstract Syntax Tree — Public Re-Export Shim
 *
 * AST node definitions for the ICE language. The real type
 * declarations live in `./ast/types.ts`; the helper functions
 * (`is_node_kind`, `create_span`, `visit_ast`) live in
 * `./ast/helpers.ts`. This file is the public surface that every
 * parser-internal module + `parser/index.ts` continues to import
 * from.
 *
 * Decomposed in rf-ast-1. The original `ast.ts` was 701 LOC of
 * mixed types-and-helpers; the split keeps every consumer's
 * `import { ... } from './ast'` working unchanged.
 */

export * from './ast/types';
export { is_node_kind, create_span, visit_ast } from './ast/helpers';
