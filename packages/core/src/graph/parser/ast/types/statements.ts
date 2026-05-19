/**
 * AST — Top-level statement node types.
 *
 * The `Program` root, the `Statement` union, and every concrete
 * top-level block type (resource, data, variable, output, provider,
 * module, locals, import). Plus the `LifecycleConfig`,
 * `ValidationRule`, and `TypeExpression` helper types that hang off
 * specific statement bodies.
 *
 * Depends on `./expressions.ts` (Identifier, Reference, StringLiteral,
 * Expression, TypeIdentifier) and `./blocks.ts` (Block).
 *
 * Extracted from `ast/types.ts` in rf-asttyp-1.
 */

import type { AstNode } from './base';
import type { Block } from './blocks';
import type { Expression, Identifier, Reference, StringLiteral, TypeIdentifier } from './expressions';

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
