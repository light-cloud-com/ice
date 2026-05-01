/**
 * Abstract Syntax Tree — Type Definitions
 *
 * AST node interface declarations for the ICE language. The set is
 * frozen here; the helpers (`is_node_kind`, `create_span`, `visit_ast`)
 * live in `./helpers.ts`. The original `ast.ts` is kept as a re-export
 * shim so consumers using `import {...} from '../ast.js'` continue to
 * work unchanged.
 *
 * Extracted from `parser/ast.ts` in rf-ast-1.
 */

import type { SourceSpan } from '../tokens.js';

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

// =============================================================================
// Program
// =============================================================================

/**
 * Root node representing an entire ICE program.
 */
export interface Program extends AstNode {
  readonly kind: 'Program';
  readonly statements: Statement[];
}

/**
 * Top-level statement types.
 */
export type Statement =
  | ResourceBlock
  | DataBlock
  | VariableBlock
  | OutputBlock
  | ProviderBlock
  | ModuleBlock
  | LocalsBlock
  | ImportStatement;

// =============================================================================
// Resource Block
// =============================================================================

/**
 * Resource definition block.
 */
export interface ResourceBlock extends AstNode {
  readonly kind: 'ResourceBlock';

  /** Resource type (e.g., "Ec2.Instance") */
  readonly resource_type: TypeIdentifier;

  /** Resource name/identifier */
  readonly name: Identifier;

  /** Resource body */
  readonly body: Block;

  /** Optional count expression */
  readonly count?: Expression;

  /** Optional for_each expression */
  readonly for_each?: Expression;

  /** Optional provider reference */
  readonly provider?: Reference;

  /** Dependencies */
  readonly depends_on?: Reference[];

  /** Lifecycle configuration */
  readonly lifecycle?: LifecycleConfig;
}

/**
 * Lifecycle configuration for resources.
 */
export interface LifecycleConfig {
  readonly create_before_destroy?: boolean;
  readonly prevent_destroy?: boolean;
  readonly ignore_changes?: string[];
  readonly replace_triggered_by?: Reference[];
}

// =============================================================================
// Data Block
// =============================================================================

/**
 * Data source block.
 */
export interface DataBlock extends AstNode {
  readonly kind: 'DataBlock';

  /** Data source type */
  readonly data_type: TypeIdentifier;

  /** Data source name */
  readonly name: Identifier;

  /** Data source body */
  readonly body: Block;
}

// =============================================================================
// Variable Block
// =============================================================================

/**
 * Variable definition block.
 */
export interface VariableBlock extends AstNode {
  readonly kind: 'VariableBlock';

  /** Variable name */
  readonly name: Identifier;

  /** Type constraint */
  readonly type_constraint?: TypeExpression;

  /** Default value */
  readonly default_value?: Expression;

  /** Description */
  readonly description?: StringLiteral;

  /** Whether the variable is sensitive */
  readonly sensitive?: boolean;

  /** Validation rules */
  readonly validations?: ValidationRule[];
}

/**
 * Variable validation rule.
 */
export interface ValidationRule {
  readonly condition: Expression;
  readonly error_message: Expression;
}

/**
 * Type expression for variable constraints.
 */
export type TypeExpression =
  | 'string'
  | 'number'
  | 'bool'
  | 'any'
  | { list: TypeExpression }
  | { set: TypeExpression }
  | { map: TypeExpression }
  | { object: Record<string, TypeExpression> }
  | { tuple: TypeExpression[] };

// =============================================================================
// Output Block
// =============================================================================

/**
 * Output definition block.
 */
export interface OutputBlock extends AstNode {
  readonly kind: 'OutputBlock';

  /** Output name */
  readonly name: Identifier;

  /** Output value expression */
  readonly value: Expression;

  /** Description */
  readonly description?: StringLiteral;

  /** Whether the output is sensitive */
  readonly sensitive?: boolean;

  /** Dependency condition */
  readonly depends_on?: Reference[];
}

// =============================================================================
// Provider Block
// =============================================================================

/**
 * Provider configuration block.
 */
export interface ProviderBlock extends AstNode {
  readonly kind: 'ProviderBlock';

  /** Provider name (e.g., "aws", "azure") */
  readonly provider_name: Identifier;

  /** Provider alias */
  readonly alias?: Identifier;

  /** Provider configuration */
  readonly body: Block;
}

// =============================================================================
// Module Block
// =============================================================================

/**
 * Module call block.
 */
export interface ModuleBlock extends AstNode {
  readonly kind: 'ModuleBlock';

  /** Module name */
  readonly name: Identifier;

  /** Module source */
  readonly source: StringLiteral;

  /** Module version */
  readonly version?: StringLiteral;

  /** Module inputs */
  readonly body: Block;

  /** Providers to pass */
  readonly providers?: Record<string, Reference>;
}

// =============================================================================
// Locals Block
// =============================================================================

/**
 * Local values block.
 */
export interface LocalsBlock extends AstNode {
  readonly kind: 'LocalsBlock';

  /** Local value definitions */
  readonly values: Record<string, Expression>;
}

// =============================================================================
// Import Statement
// =============================================================================

/**
 * Import statement for modules/resources.
 */
export interface ImportStatement extends AstNode {
  readonly kind: 'ImportStatement';

  /** Import path */
  readonly path: StringLiteral;

  /** Import alias */
  readonly alias?: Identifier;
}

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
