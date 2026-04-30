/**
 * ICE Language Parser
 *
 * Recursive descent parser that builds an AST from tokens.
 */

import { describe_token } from './tokens.js';
import type {
  Program,
  Statement,
  ResourceBlock,
  DataBlock,
  VariableBlock,
  OutputBlock,
  ProviderBlock,
  ModuleBlock,
  LocalsBlock,
  ImportStatement,
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
  BinaryExpression,
  UnaryExpression,
  ConditionalExpression,
  ForExpression,
  Reference,
  Block,
  Attribute,
  NestedBlock,
  BinaryOperator,
  UnaryOperator,
} from './ast.js';
import type { Token, SourceSpan, SourcePosition } from './tokens.js';
import {
  type ParserState,
  make_parser_state,
  ps_current,
  ps_previous,
  ps_advance,
  ps_check,
  ps_match,
  ps_consume,
  ps_is_at_end,
  ps_add_error,
  ps_synchronize,
} from './parser-state.js';

// =============================================================================
// Parser Error
// =============================================================================

/**
 * Parser error with source position.
 */
export interface ParserError {
  readonly message: string;
  readonly position: SourcePosition;
  readonly token?: Token;
}

/**
 * Parser result.
 */
export interface ParserResult {
  readonly program: Program | null;
  readonly errors: ParserError[];
}

// =============================================================================
// Parser Configuration
// =============================================================================

/**
 * Parser options.
 */
export interface ParserOptions {
  /** Maximum errors before stopping */
  readonly max_errors?: number;

  /** Whether to recover from errors */
  readonly error_recovery?: boolean;
}

// `DEFAULT_OPTIONS` lives on `parser-state.ts` as `DEFAULT_PARSER_OPTIONS`;
// `make_parser_state` applies it. The class no longer needs a local copy.

// =============================================================================
// Parser Implementation
// =============================================================================

/**
 * ICE language parser.
 *
 * The class is a thin lifecycle shell: the constructor builds a
 * `ParserState` from `(tokens, options)` and stashes it on `this.state`,
 * and every other method passes `this.state` through to the standalone
 * `ps_*` navigation helpers and `parse_*` block/expression parsers.
 * Field-level mutable state (`pos`, `errors`) lives on `state`, not on
 * the class — see `parser-state.ts` for the full state shape.
 */
export class Parser {
  private readonly state: ParserState;

  constructor(tokens: Token[], options: Partial<ParserOptions> = {}) {
    this.state = make_parser_state(tokens, options);
  }

  /**
   * Parse the token stream into an AST.
   */
  parse(): ParserResult {
    try {
      const program = this.parse_program();
      return { program, errors: this.state.errors };
    } catch {
      return { program: null, errors: this.state.errors };
    }
  }

  // ---------------------------------------------------------------------------
  // Program Parsing
  // ---------------------------------------------------------------------------

  private parse_program(): Program {
    const statements: Statement[] = [];
    const start = ps_current(this.state).position;

    while (!ps_is_at_end(this.state)) {
      if (this.state.errors.length >= this.state.options.max_errors) {
        break;
      }

      try {
        const stmt = this.parse_statement();
        if (stmt) {
          statements.push(stmt);
        }
      } catch {
        if (this.state.options.error_recovery) {
          ps_synchronize(this.state);
        } else {
          throw new Error('Parse error');
        }
      }
    }

    const end = ps_previous(this.state).position;

    return {
      kind: 'Program',
      statements,
      span: this.create_span(start, end),
    };
  }

  private parse_statement(): Statement | null {
    const token = ps_current(this.state);

    switch (token.type) {
      case 'RESOURCE':
        return this.parse_resource_block();
      case 'DATA':
        return this.parse_data_block();
      case 'VARIABLE':
        return this.parse_variable_block();
      case 'OUTPUT':
        return this.parse_output_block();
      case 'PROVIDER':
        return this.parse_provider_block();
      case 'MODULE':
        return this.parse_module_block();
      case 'LOCALS':
        return this.parse_locals_block();
      case 'IMPORT':
        return this.parse_import_statement();
      default:
        ps_add_error(this.state, `Unexpected token ${describe_token(token.type)}`);
        ps_advance(this.state);
        return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Block Parsing
  // ---------------------------------------------------------------------------

  private parse_resource_block(): ResourceBlock {
    const start = ps_current(this.state).position;
    ps_consume(this.state, 'RESOURCE', "Expected 'resource'");

    const resource_type = this.parse_type_identifier();
    const name = this.parse_identifier();
    const body = this.parse_block();

    const end = ps_previous(this.state).position;

    return {
      kind: 'ResourceBlock',
      resource_type,
      name,
      body,
      span: this.create_span(start, end),
    };
  }

  private parse_data_block(): DataBlock {
    const start = ps_current(this.state).position;
    ps_consume(this.state, 'DATA', "Expected 'data'");

    const data_type = this.parse_type_identifier();
    const name = this.parse_identifier();
    const body = this.parse_block();

    const end = ps_previous(this.state).position;

    return {
      kind: 'DataBlock',
      data_type,
      name,
      body,
      span: this.create_span(start, end),
    };
  }

  private parse_variable_block(): VariableBlock {
    const start = ps_current(this.state).position;
    ps_consume(this.state, 'VARIABLE', "Expected 'variable'");

    const name = this.parse_identifier();
    ps_consume(this.state, 'LEFT_BRACE', "Expected '{'");

    let description: StringLiteral | undefined;
    let default_value: Expression | undefined;
    let sensitive: boolean | undefined;

    while (!ps_check(this.state, 'RIGHT_BRACE') && !ps_is_at_end(this.state)) {
      const attr_name = this.parse_identifier();
      ps_consume(this.state, 'EQUALS', "Expected '='");

      switch (attr_name.name) {
        case 'description':
          description = this.parse_string_literal();
          break;
        case 'default':
          default_value = this.parse_expression();
          break;
        case 'sensitive':
          sensitive = this.parse_boolean_literal()?.value;
          break;
        default:
          this.parse_expression(); // Skip unknown attributes
      }
    }

    ps_consume(this.state, 'RIGHT_BRACE', "Expected '}'");
    const end = ps_previous(this.state).position;

    return {
      kind: 'VariableBlock',
      name,
      description,
      default_value,
      sensitive,
      span: this.create_span(start, end),
    };
  }

  private parse_output_block(): OutputBlock {
    const start = ps_current(this.state).position;
    ps_consume(this.state, 'OUTPUT', "Expected 'output'");

    const name = this.parse_identifier();
    ps_consume(this.state, 'LEFT_BRACE', "Expected '{'");

    let value: Expression | undefined;
    let description: StringLiteral | undefined;
    let sensitive: boolean | undefined;

    while (!ps_check(this.state, 'RIGHT_BRACE') && !ps_is_at_end(this.state)) {
      const attr_name = this.parse_identifier();
      ps_consume(this.state, 'EQUALS', "Expected '='");

      switch (attr_name.name) {
        case 'value':
          value = this.parse_expression();
          break;
        case 'description':
          description = this.parse_string_literal();
          break;
        case 'sensitive':
          sensitive = this.parse_boolean_literal()?.value;
          break;
        default:
          this.parse_expression();
      }
    }

    ps_consume(this.state, 'RIGHT_BRACE', "Expected '}'");
    const end = ps_previous(this.state).position;

    if (!value) {
      ps_add_error(this.state, "Output block requires 'value' attribute");
      value = this.create_null_literal(start);
    }

    return {
      kind: 'OutputBlock',
      name,
      value,
      description,
      sensitive,
      span: this.create_span(start, end),
    };
  }

  private parse_provider_block(): ProviderBlock {
    const start = ps_current(this.state).position;
    ps_consume(this.state, 'PROVIDER', "Expected 'provider'");

    const provider_name = this.parse_identifier();
    const body = this.parse_block();

    const end = ps_previous(this.state).position;

    return {
      kind: 'ProviderBlock',
      provider_name,
      body,
      span: this.create_span(start, end),
    };
  }

  private parse_module_block(): ModuleBlock {
    const start = ps_current(this.state).position;
    ps_consume(this.state, 'MODULE', "Expected 'module'");

    const name = this.parse_identifier();
    ps_consume(this.state, 'LEFT_BRACE', "Expected '{'");

    let source: StringLiteral | undefined;
    let version: StringLiteral | undefined;
    const attributes: Attribute[] = [];

    while (!ps_check(this.state, 'RIGHT_BRACE') && !ps_is_at_end(this.state)) {
      const attr_name = this.parse_identifier();
      ps_consume(this.state, 'EQUALS', "Expected '='");

      if (attr_name.name === 'source') {
        source = this.parse_string_literal();
      } else if (attr_name.name === 'version') {
        version = this.parse_string_literal();
      } else {
        const value = this.parse_expression();
        attributes.push({
          kind: 'Attribute',
          name: attr_name,
          value,
          span: this.create_span(attr_name.span.start, ps_previous(this.state).position),
        });
      }
    }

    ps_consume(this.state, 'RIGHT_BRACE', "Expected '}'");
    const end = ps_previous(this.state).position;

    if (!source) {
      ps_add_error(this.state, "Module block requires 'source' attribute");
      source = {
        kind: 'StringLiteral',
        value: '',
        span: this.create_span(start, start),
      };
    }

    return {
      kind: 'ModuleBlock',
      name,
      source,
      version,
      body: {
        kind: 'Block',
        attributes,
        blocks: [],
        span: this.create_span(start, end),
      },
      span: this.create_span(start, end),
    };
  }

  private parse_locals_block(): LocalsBlock {
    const start = ps_current(this.state).position;
    ps_consume(this.state, 'LOCALS', "Expected 'locals'");
    ps_consume(this.state, 'LEFT_BRACE', "Expected '{'");

    const values: Record<string, Expression> = {};

    while (!ps_check(this.state, 'RIGHT_BRACE') && !ps_is_at_end(this.state)) {
      const name = this.parse_identifier();
      ps_consume(this.state, 'EQUALS', "Expected '='");
      const value = this.parse_expression();
      values[name.name] = value;
    }

    ps_consume(this.state, 'RIGHT_BRACE', "Expected '}'");
    const end = ps_previous(this.state).position;

    return {
      kind: 'LocalsBlock',
      values,
      span: this.create_span(start, end),
    };
  }

  private parse_import_statement(): ImportStatement {
    const start = ps_current(this.state).position;
    ps_consume(this.state, 'IMPORT', "Expected 'import'");

    const path = this.parse_string_literal();

    let alias: Identifier | undefined;
    if (ps_match(this.state, 'IDENTIFIER')) {
      // Check for "as" keyword
      if (ps_previous(this.state).value === 'as') {
        alias = this.parse_identifier();
      }
    }

    const end = ps_previous(this.state).position;

    return {
      kind: 'ImportStatement',
      path,
      alias,
      span: this.create_span(start, end),
    };
  }

  private parse_block(): Block {
    const start = ps_current(this.state).position;
    ps_consume(this.state, 'LEFT_BRACE', "Expected '{'");

    const attributes: Attribute[] = [];
    const blocks: NestedBlock[] = [];

    while (!ps_check(this.state, 'RIGHT_BRACE') && !ps_is_at_end(this.state)) {
      const name = this.parse_identifier();

      if (ps_check(this.state, 'EQUALS')) {
        // Attribute
        ps_advance(this.state);
        const value = this.parse_expression();
        attributes.push({
          kind: 'Attribute',
          name,
          value,
          span: this.create_span(name.span.start, ps_previous(this.state).position),
        });
      } else if (ps_check(this.state, 'LEFT_BRACE') || ps_check(this.state, 'STRING') || ps_check(this.state, 'IDENTIFIER')) {
        // Nested block
        const labels: string[] = [];
        while (ps_check(this.state, 'STRING') || ps_check(this.state, 'IDENTIFIER')) {
          if (ps_check(this.state, 'STRING')) {
            labels.push(ps_advance(this.state).literal as string);
          } else {
            labels.push(ps_advance(this.state).value);
          }
        }
        const nested_body = this.parse_block();
        blocks.push({
          type: name.name,
          labels,
          body: nested_body,
        });
      } else {
        ps_add_error(this.state, `Unexpected token after identifier '${name.name}'`);
        ps_synchronize(this.state);
      }
    }

    ps_consume(this.state, 'RIGHT_BRACE', "Expected '}'");
    const end = ps_previous(this.state).position;

    return {
      kind: 'Block',
      attributes,
      blocks,
      span: this.create_span(start, end),
    };
  }

  // ---------------------------------------------------------------------------
  // Expression Parsing
  // ---------------------------------------------------------------------------

  private parse_expression(): Expression {
    return this.parse_conditional();
  }

  private parse_conditional(): Expression {
    const expr = this.parse_or();

    if (ps_match(this.state, 'QUESTION')) {
      const start = expr.span.start;
      const then_branch = this.parse_expression();
      ps_consume(this.state, 'COLON', "Expected ':' in conditional");
      const else_branch = this.parse_conditional();

      return {
        kind: 'ConditionalExpression',
        condition: expr,
        then_branch,
        else_branch,
        span: this.create_span(start, else_branch.span.end),
      } as ConditionalExpression;
    }

    return expr;
  }

  private parse_or(): Expression {
    let left = this.parse_and();

    while (ps_match(this.state, 'OR')) {
      const operator = '||' as BinaryOperator;
      const right = this.parse_and();
      left = {
        kind: 'BinaryExpression',
        operator,
        left,
        right,
        span: this.create_span(left.span.start, right.span.end),
      } as BinaryExpression;
    }

    return left;
  }

  private parse_and(): Expression {
    let left = this.parse_equality();

    while (ps_match(this.state, 'AND')) {
      const operator = '&&' as BinaryOperator;
      const right = this.parse_equality();
      left = {
        kind: 'BinaryExpression',
        operator,
        left,
        right,
        span: this.create_span(left.span.start, right.span.end),
      } as BinaryExpression;
    }

    return left;
  }

  private parse_equality(): Expression {
    let left = this.parse_comparison();

    while (ps_match(this.state, 'EQUALS_EQUALS', 'NOT_EQUALS')) {
      const operator = (ps_previous(this.state).value === '==' ? '==' : '!=') as BinaryOperator;
      const right = this.parse_comparison();
      left = {
        kind: 'BinaryExpression',
        operator,
        left,
        right,
        span: this.create_span(left.span.start, right.span.end),
      } as BinaryExpression;
    }

    return left;
  }

  private parse_comparison(): Expression {
    let left = this.parse_term();

    while (ps_match(this.state, 'LESS_THAN', 'LESS_THAN_EQUALS', 'GREATER_THAN', 'GREATER_THAN_EQUALS')) {
      const token = ps_previous(this.state);
      const operator = token.value as BinaryOperator;
      const right = this.parse_term();
      left = {
        kind: 'BinaryExpression',
        operator,
        left,
        right,
        span: this.create_span(left.span.start, right.span.end),
      } as BinaryExpression;
    }

    return left;
  }

  private parse_term(): Expression {
    let left = this.parse_factor();

    while (ps_match(this.state, 'PLUS', 'MINUS')) {
      const operator = ps_previous(this.state).value as BinaryOperator;
      const right = this.parse_factor();
      left = {
        kind: 'BinaryExpression',
        operator,
        left,
        right,
        span: this.create_span(left.span.start, right.span.end),
      } as BinaryExpression;
    }

    return left;
  }

  private parse_factor(): Expression {
    let left = this.parse_unary();

    while (ps_match(this.state, 'STAR', 'SLASH', 'PERCENT')) {
      const operator = ps_previous(this.state).value as BinaryOperator;
      const right = this.parse_unary();
      left = {
        kind: 'BinaryExpression',
        operator,
        left,
        right,
        span: this.create_span(left.span.start, right.span.end),
      } as BinaryExpression;
    }

    return left;
  }

  private parse_unary(): Expression {
    if (ps_match(this.state, 'NOT', 'MINUS')) {
      const start = ps_previous(this.state).position;
      const operator = ps_previous(this.state).value as UnaryOperator;
      const operand = this.parse_unary();
      return {
        kind: 'UnaryExpression',
        operator,
        operand,
        span: this.create_span(start, operand.span.end),
      } as UnaryExpression;
    }

    return this.parse_postfix();
  }

  private parse_postfix(): Expression {
    let expr = this.parse_primary();

    while (true) {
      if (ps_match(this.state, 'DOT')) {
        const property = this.parse_identifier();
        expr = {
          kind: 'PropertyAccess',
          object: expr,
          property,
          span: this.create_span(expr.span.start, property.span.end),
        } as PropertyAccess;
      } else if (ps_match(this.state, 'LEFT_BRACKET')) {
        const index = this.parse_expression();
        ps_consume(this.state, 'RIGHT_BRACKET', "Expected ']'");
        const end = ps_previous(this.state).position;
        expr = {
          kind: 'IndexAccess',
          object: expr,
          index,
          span: this.create_span(expr.span.start, end),
        } as IndexAccess;
      } else if (ps_match(this.state, 'LEFT_PAREN')) {
        // Function call
        const args: Expression[] = [];
        if (!ps_check(this.state, 'RIGHT_PAREN')) {
          do {
            args.push(this.parse_expression());
          } while (ps_match(this.state, 'COMMA'));
        }
        ps_consume(this.state, 'RIGHT_PAREN', "Expected ')'");
        const end = ps_previous(this.state).position;

        if (expr.kind !== 'Identifier') {
          ps_add_error(this.state, 'Expected function name');
        }

        expr = {
          kind: 'FunctionCall',
          callee: expr as Identifier,
          arguments: args,
          span: this.create_span(expr.span.start, end),
        } as FunctionCall;
      } else {
        break;
      }
    }

    return expr;
  }

  private parse_primary(): Expression {
    const token = ps_current(this.state);

    if (ps_match(this.state, 'STRING')) {
      return {
        kind: 'StringLiteral',
        value: token.literal as string,
        span: this.create_span(token.position, token.position),
      } as StringLiteral;
    }

    if (ps_match(this.state, 'NUMBER')) {
      return {
        kind: 'NumberLiteral',
        value: token.literal as number,
        span: this.create_span(token.position, token.position),
      } as NumberLiteral;
    }

    if (ps_match(this.state, 'BOOLEAN')) {
      return {
        kind: 'BooleanLiteral',
        value: token.literal as boolean,
        span: this.create_span(token.position, token.position),
      } as BooleanLiteral;
    }

    if (ps_match(this.state, 'NULL')) {
      return {
        kind: 'NullLiteral',
        span: this.create_span(token.position, token.position),
      } as NullLiteral;
    }

    if (ps_match(this.state, 'LEFT_BRACKET')) {
      return this.parse_array_expression(token.position);
    }

    if (ps_match(this.state, 'LEFT_BRACE')) {
      return this.parse_object_expression(token.position);
    }

    if (ps_match(this.state, 'LEFT_PAREN')) {
      const expr = this.parse_expression();
      ps_consume(this.state, 'RIGHT_PAREN', "Expected ')'");
      return expr;
    }

    if (ps_match(this.state, 'FOR')) {
      return this.parse_for_expression(token.position);
    }

    if (ps_match(this.state, 'TYPE_IDENTIFIER')) {
      return {
        kind: 'TypeIdentifier',
        name: token.value,
        span: this.create_span(token.position, token.position),
      } as TypeIdentifier;
    }

    if (ps_match(this.state, 'IDENTIFIER')) {
      // Check if this is a reference
      const name = token.value;

      if (['var', 'local', 'module', 'path', 'data'].includes(name)) {
        return this.parse_reference(token.position, name);
      }

      return {
        kind: 'Identifier',
        name,
        span: this.create_span(token.position, token.position),
      } as Identifier;
    }

    ps_add_error(this.state, `Unexpected token ${describe_token(token.type)}`);
    ps_advance(this.state);
    return this.create_null_literal(token.position);
  }

  private parse_array_expression(start: SourcePosition): ArrayExpression {
    const elements: Expression[] = [];

    if (!ps_check(this.state, 'RIGHT_BRACKET')) {
      do {
        if (ps_check(this.state, 'RIGHT_BRACKET')) break;
        elements.push(this.parse_expression());
      } while (ps_match(this.state, 'COMMA'));
    }

    ps_consume(this.state, 'RIGHT_BRACKET', "Expected ']'");
    const end = ps_previous(this.state).position;

    return {
      kind: 'ArrayExpression',
      elements,
      span: this.create_span(start, end),
    };
  }

  private parse_object_expression(start: SourcePosition): ObjectExpression {
    const properties: ObjectProperty[] = [];

    if (!ps_check(this.state, 'RIGHT_BRACE')) {
      do {
        if (ps_check(this.state, 'RIGHT_BRACE')) break;

        let key: Expression;
        let computed = false;

        if (ps_match(this.state, 'LEFT_PAREN')) {
          key = this.parse_expression();
          ps_consume(this.state, 'RIGHT_PAREN', "Expected ')'");
          computed = true;
        } else if (ps_check(this.state, 'STRING')) {
          key = this.parse_string_literal();
        } else {
          key = this.parse_identifier();
        }

        ps_consume(this.state, 'EQUALS', "Expected '=' or ':'");
        const value = this.parse_expression();

        properties.push({ key, value, computed });
      } while (ps_match(this.state, 'COMMA'));
    }

    ps_consume(this.state, 'RIGHT_BRACE', "Expected '}'");
    const end = ps_previous(this.state).position;

    return {
      kind: 'ObjectExpression',
      properties,
      span: this.create_span(start, end),
    };
  }

  private parse_for_expression(start: SourcePosition): ForExpression {
    let key_var: Identifier | undefined;
    let value_var: Identifier;

    const first_var = this.parse_identifier();

    if (ps_match(this.state, 'COMMA')) {
      key_var = first_var;
      value_var = this.parse_identifier();
    } else {
      value_var = first_var;
    }

    ps_consume(this.state, 'IN', "Expected 'in'");
    const collection = this.parse_expression();
    ps_consume(this.state, 'COLON', "Expected ':'");

    let key_expr: Expression | undefined;
    const value_expr = this.parse_expression();

    if (ps_match(this.state, 'FAT_ARROW')) {
      key_expr = value_expr;
    }

    let condition: Expression | undefined;
    if (ps_match(this.state, 'IF')) {
      condition = this.parse_expression();
    }

    ps_consume(this.state, 'RIGHT_BRACKET', "Expected ']' or '}'");
    const end = ps_previous(this.state).position;

    return {
      kind: 'ForExpression',
      key_var,
      value_var,
      collection,
      key_expr,
      value_expr,
      condition,
      span: this.create_span(start, end),
    };
  }

  private parse_reference(start: SourcePosition, ref_type: string): Reference {
    ps_consume(this.state, 'DOT', "Expected '.' after reference type");

    let type_name: string | undefined;
    let name: string;
    const path: string[] = [];

    if (ref_type === 'data') {
      type_name = this.parse_identifier().name;
      ps_consume(this.state, 'DOT', "Expected '.' after data type");
      name = this.parse_identifier().name;
    } else {
      name = this.parse_identifier().name;
    }

    while (ps_match(this.state, 'DOT')) {
      path.push(this.parse_identifier().name);
    }

    const end = ps_previous(this.state).position;

    return {
      kind: 'Reference',
      ref_type: ref_type as Reference['ref_type'],
      type_name,
      name,
      path: path.length > 0 ? path : undefined,
      span: this.create_span(start, end),
    };
  }

  // ---------------------------------------------------------------------------
  // Helper Methods
  // ---------------------------------------------------------------------------

  private parse_identifier(): Identifier {
    const token = ps_consume(this.state, 'IDENTIFIER', 'Expected identifier');
    return {
      kind: 'Identifier',
      name: token.value,
      span: this.create_span(token.position, token.position),
    };
  }

  private parse_type_identifier(): TypeIdentifier {
    let name = '';
    const start = ps_current(this.state).position;

    // Handle both "Ec2.Instance" and "aws_instance" style types
    if (ps_check(this.state, 'TYPE_IDENTIFIER')) {
      const token = ps_advance(this.state);
      name = token.value;
    } else if (ps_check(this.state, 'IDENTIFIER')) {
      name = ps_advance(this.state).value;
      while (ps_match(this.state, 'DOT')) {
        name += '.';
        if (ps_check(this.state, 'IDENTIFIER') || ps_check(this.state, 'TYPE_IDENTIFIER')) {
          name += ps_advance(this.state).value;
        }
      }
    } else if (ps_check(this.state, 'STRING')) {
      name = ps_advance(this.state).literal as string;
    } else {
      ps_add_error(this.state, 'Expected type identifier');
    }

    const end = ps_previous(this.state).position;

    return {
      kind: 'TypeIdentifier',
      name,
      span: this.create_span(start, end),
    };
  }

  private parse_string_literal(): StringLiteral {
    const token = ps_consume(this.state, 'STRING', 'Expected string');
    return {
      kind: 'StringLiteral',
      value: token.literal as string,
      span: this.create_span(token.position, token.position),
    };
  }

  private parse_boolean_literal(): BooleanLiteral | null {
    if (ps_check(this.state, 'BOOLEAN')) {
      const token = ps_advance(this.state);
      return {
        kind: 'BooleanLiteral',
        value: token.literal as boolean,
        span: this.create_span(token.position, token.position),
      };
    }
    return null;
  }

  private create_null_literal(pos: SourcePosition): NullLiteral {
    return {
      kind: 'NullLiteral',
      span: this.create_span(pos, pos),
    };
  }

  private create_span(start: SourcePosition, end: SourcePosition): SourceSpan {
    return { start, end };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Parse ICE source code into an AST.
 */
export function parse(tokens: Token[], options?: Partial<ParserOptions>): ParserResult {
  const parser = new Parser(tokens, options);
  return parser.parse();
}
