/**
 * AST — Expression node types.
 *
 * The `Expression` union plus every leaf literal / call / access /
 * splat / for-comprehension type. All extend `AstNode` (from
 * `./base.ts`).
 *
 * `ObjectProperty` is the non-AstNode helper for object-literal keys
 * and is re-exported from the top-level shim alongside the AstNode
 * types so consumers don't need to know which sub-file owns it.
 *
 * Extracted from `ast/types.ts` in rf-asttyp-1.
 */

import type { AstNode } from './base';

// =============================================================================
// Expressions
// =============================================================================

/**
 * All expression types.
 */
export type Expression =
  | Identifier
  | TypeIdentifier
  | StringLiteral
  | NumberLiteral
  | BooleanLiteral
  | NullLiteral
  | ArrayExpression
  | ObjectExpression
  | PropertyAccess
  | IndexAccess
  | FunctionCall
  | BinaryExpression
  | UnaryExpression
  | ConditionalExpression
  | ForExpression
  | Interpolation
  | Reference
  | SplatExpression;

/**
 * Identifier.
 */
export interface Identifier extends AstNode {
  readonly kind: 'Identifier';
  readonly name: string;
}

/**
 * Type identifier (e.g., "Ec2.Instance").
 */
export interface TypeIdentifier extends AstNode {
  readonly kind: 'TypeIdentifier';
  readonly name: string;
}

/**
 * String literal.
 */
export interface StringLiteral extends AstNode {
  readonly kind: 'StringLiteral';
  readonly value: string;

  /** Whether this is a heredoc string */
  readonly heredoc?: boolean;

  /** Interpolation parts (if any) */
  readonly parts?: (string | Expression)[];
}

/**
 * Number literal.
 */
export interface NumberLiteral extends AstNode {
  readonly kind: 'NumberLiteral';
  readonly value: number;
}

/**
 * Boolean literal.
 */
export interface BooleanLiteral extends AstNode {
  readonly kind: 'BooleanLiteral';
  readonly value: boolean;
}

/**
 * Null literal.
 */
export interface NullLiteral extends AstNode {
  readonly kind: 'NullLiteral';
}

/**
 * Array expression.
 */
export interface ArrayExpression extends AstNode {
  readonly kind: 'ArrayExpression';
  readonly elements: Expression[];
}

/**
 * Object expression.
 */
export interface ObjectExpression extends AstNode {
  readonly kind: 'ObjectExpression';
  readonly properties: ObjectProperty[];
}

/**
 * Object property.
 */
export interface ObjectProperty {
  readonly key: Expression;
  readonly value: Expression;
  readonly computed?: boolean;
}

/**
 * Property access (e.g., "obj.prop").
 */
export interface PropertyAccess extends AstNode {
  readonly kind: 'PropertyAccess';
  readonly object: Expression;
  readonly property: Identifier;
}

/**
 * Index access (e.g., "arr[0]").
 */
export interface IndexAccess extends AstNode {
  readonly kind: 'IndexAccess';
  readonly object: Expression;
  readonly index: Expression;
}

/**
 * Function call.
 */
export interface FunctionCall extends AstNode {
  readonly kind: 'FunctionCall';
  readonly callee: Identifier;
  readonly arguments: Expression[];
}

/**
 * Binary expression operators.
 */
export type BinaryOperator = '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||';

/**
 * Binary expression.
 */
export interface BinaryExpression extends AstNode {
  readonly kind: 'BinaryExpression';
  readonly operator: BinaryOperator;
  readonly left: Expression;
  readonly right: Expression;
}

/**
 * Unary expression operators.
 */
export type UnaryOperator = '!' | '-';

/**
 * Unary expression.
 */
export interface UnaryExpression extends AstNode {
  readonly kind: 'UnaryExpression';
  readonly operator: UnaryOperator;
  readonly operand: Expression;
}

/**
 * Conditional expression (ternary).
 */
export interface ConditionalExpression extends AstNode {
  readonly kind: 'ConditionalExpression';
  readonly condition: Expression;
  readonly then_branch: Expression;
  readonly else_branch: Expression;
}

/**
 * For expression (list/map comprehension).
 */
export interface ForExpression extends AstNode {
  readonly kind: 'ForExpression';

  /** Key variable (for maps) */
  readonly key_var?: Identifier;

  /** Value variable */
  readonly value_var: Identifier;

  /** Collection to iterate */
  readonly collection: Expression;

  /** Key expression (for maps) */
  readonly key_expr?: Expression;

  /** Value expression */
  readonly value_expr: Expression;

  /** Optional condition */
  readonly condition?: Expression;

  /** Whether to group results */
  readonly grouping?: boolean;
}

/**
 * String interpolation.
 */
export interface Interpolation extends AstNode {
  readonly kind: 'Interpolation';
  readonly expression: Expression;
}

/**
 * Reference to another resource/data/variable.
 */
export interface Reference extends AstNode {
  readonly kind: 'Reference';

  /** Reference type (resource, data, var, local, module) */
  readonly ref_type: 'resource' | 'data' | 'var' | 'local' | 'module' | 'path';

  /** Resource/data type (if applicable) */
  readonly type_name?: string;

  /** Resource/data name */
  readonly name: string;

  /** Attribute path */
  readonly path?: string[];
}

/**
 * Splat expression (e.g., "resources[*].id").
 */
export interface SplatExpression extends AstNode {
  readonly kind: 'SplatExpression';
  readonly object: Expression;
  readonly attribute?: Identifier;

  /** Full splat ([*]) vs attribute splat (.*) */
  readonly full: boolean;
}
