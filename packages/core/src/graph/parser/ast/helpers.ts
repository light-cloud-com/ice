/**
 * AST helper functions extracted from `parser/ast.ts` in rf-ast-1.
 *
 * `is_node_kind` and `visit_ast` are part of the public AST API
 * (re-exported from `parser/index.ts`). `create_span` here is the
 * 6-arg factory variant; the 2-arg parser-internal variant lives
 * in `parser/parser-literals.ts` and is the one most parser sites
 * call. Both names co-exist intentionally — see RISK #4 in
 * `parser-literals.ts`.
 */

import type { SourceSpan } from '../tokens.js';
import type {
  ArrayExpression,
  AstNode,
  AstNodeKind,
  Attribute,
  BinaryExpression,
  Block,
  ConditionalExpression,
  FunctionCall,
  IndexAccess,
  ObjectExpression,
  Program,
  PropertyAccess,
  ResourceBlock,
  UnaryExpression,
} from './types.js';

/**
 * Check if a node is of a specific kind.
 */
export function is_node_kind<K extends AstNodeKind>(node: AstNode, kind: K): node is Extract<AstNode, { kind: K }> {
  return node.kind === kind;
}

/**
 * Create a source span from two positions.
 */
export function create_span(
  start_line: number,
  start_column: number,
  start_offset: number,
  end_line: number,
  end_column: number,
  end_offset: number,
): SourceSpan {
  return {
    start: {
      line: start_line,
      column: start_column,
      offset: start_offset,
      length: 0,
    },
    end: {
      line: end_line,
      column: end_column,
      offset: end_offset,
      length: 0,
    },
  };
}

/**
 * Visit all nodes in an AST.
 */
export function visit_ast(node: AstNode, visitor: (node: AstNode) => void): void {
  visitor(node);

  // Visit children based on node type
  switch (node.kind) {
    case 'Program':
      for (const stmt of (node as Program).statements) {
        visit_ast(stmt, visitor);
      }
      break;

    case 'ResourceBlock':
      visit_ast((node as ResourceBlock).resource_type, visitor);
      visit_ast((node as ResourceBlock).name, visitor);
      visit_ast((node as ResourceBlock).body, visitor);
      break;

    case 'Block':
      for (const attr of (node as Block).attributes) {
        visit_ast(attr, visitor);
      }
      break;

    case 'Attribute':
      visit_ast((node as Attribute).name, visitor);
      visit_ast((node as Attribute).value, visitor);
      break;

    case 'BinaryExpression':
      visit_ast((node as BinaryExpression).left, visitor);
      visit_ast((node as BinaryExpression).right, visitor);
      break;

    case 'UnaryExpression':
      visit_ast((node as UnaryExpression).operand, visitor);
      break;

    case 'ArrayExpression':
      for (const elem of (node as ArrayExpression).elements) {
        visit_ast(elem, visitor);
      }
      break;

    case 'ObjectExpression':
      for (const prop of (node as ObjectExpression).properties) {
        visit_ast(prop.key, visitor);
        visit_ast(prop.value, visitor);
      }
      break;

    case 'PropertyAccess':
      visit_ast((node as PropertyAccess).object, visitor);
      visit_ast((node as PropertyAccess).property, visitor);
      break;

    case 'IndexAccess':
      visit_ast((node as IndexAccess).object, visitor);
      visit_ast((node as IndexAccess).index, visitor);
      break;

    case 'FunctionCall':
      visit_ast((node as FunctionCall).callee, visitor);
      for (const arg of (node as FunctionCall).arguments) {
        visit_ast(arg, visitor);
      }
      break;

    case 'ConditionalExpression':
      visit_ast((node as ConditionalExpression).condition, visitor);
      visit_ast((node as ConditionalExpression).then_branch, visitor);
      visit_ast((node as ConditionalExpression).else_branch, visitor);
      break;

    // Leaf nodes - no children
    case 'Identifier':
    case 'TypeIdentifier':
    case 'StringLiteral':
    case 'NumberLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
    case 'Reference':
      break;
  }
}
