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
import type { Token, TokenType, SourceSpan, SourcePosition } from './tokens.js';

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

const DEFAULT_OPTIONS: Required<ParserOptions> = {
  max_errors: 100,
  error_recovery: true,
};

// =============================================================================
// Parser Implementation
// =============================================================================

/**
 * ICE language parser.
 */
export class Parser {
  private readonly tokens: Token[];
  private readonly options: Required<ParserOptions>;

  private pos = 0;
  private errors: ParserError[] = [];

  constructor(tokens: Token[], options: Partial<ParserOptions> = {}) {
    this.tokens = tokens;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Parse the token stream into an AST.
   */
  parse(): ParserResult {
    try {
      const program = this.parse_program();
      return { program, errors: this.errors };
    } catch {
      return { program: null, errors: this.errors };
    }
  }

  // ---------------------------------------------------------------------------
  // Program Parsing
  // ---------------------------------------------------------------------------

  private parse_program(): Program {
    const statements: Statement[] = [];
    const start = this.current().position;

    while (!this.is_at_end()) {
      if (this.errors.length >= this.options.max_errors) {
        break;
      }

      try {
        const stmt = this.parse_statement();
        if (stmt) {
          statements.push(stmt);
        }
      } catch {
        if (this.options.error_recovery) {
          this.synchronize();
        } else {
          throw new Error('Parse error');
        }
      }
    }

    const end = this.previous().position;

    return {
      kind: 'Program',
      statements,
      span: this.create_span(start, end),
    };
  }

  private parse_statement(): Statement | null {
    const token = this.current();

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
        this.add_error(`Unexpected token ${describe_token(token.type)}`);
        this.advance();
        return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Block Parsing
  // ---------------------------------------------------------------------------

  private parse_resource_block(): ResourceBlock {
    const start = this.current().position;
    this.consume('RESOURCE', "Expected 'resource'");

    const resource_type = this.parse_type_identifier();
    const name = this.parse_identifier();
    const body = this.parse_block();

    const end = this.previous().position;

    return {
      kind: 'ResourceBlock',
      resource_type,
      name,
      body,
      span: this.create_span(start, end),
    };
  }

  private parse_data_block(): DataBlock {
    const start = this.current().position;
    this.consume('DATA', "Expected 'data'");

    const data_type = this.parse_type_identifier();
    const name = this.parse_identifier();
    const body = this.parse_block();

    const end = this.previous().position;

    return {
      kind: 'DataBlock',
      data_type,
      name,
      body,
      span: this.create_span(start, end),
    };
  }

  private parse_variable_block(): VariableBlock {
    const start = this.current().position;
    this.consume('VARIABLE', "Expected 'variable'");

    const name = this.parse_identifier();
    this.consume('LEFT_BRACE', "Expected '{'");

    let description: StringLiteral | undefined;
    let default_value: Expression | undefined;
    let sensitive: boolean | undefined;

    while (!this.check('RIGHT_BRACE') && !this.is_at_end()) {
      const attr_name = this.parse_identifier();
      this.consume('EQUALS', "Expected '='");

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

    this.consume('RIGHT_BRACE', "Expected '}'");
    const end = this.previous().position;

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
    const start = this.current().position;
    this.consume('OUTPUT', "Expected 'output'");

    const name = this.parse_identifier();
    this.consume('LEFT_BRACE', "Expected '{'");

    let value: Expression | undefined;
    let description: StringLiteral | undefined;
    let sensitive: boolean | undefined;

    while (!this.check('RIGHT_BRACE') && !this.is_at_end()) {
      const attr_name = this.parse_identifier();
      this.consume('EQUALS', "Expected '='");

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

    this.consume('RIGHT_BRACE', "Expected '}'");
    const end = this.previous().position;

    if (!value) {
      this.add_error("Output block requires 'value' attribute");
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
    const start = this.current().position;
    this.consume('PROVIDER', "Expected 'provider'");

    const provider_name = this.parse_identifier();
    const body = this.parse_block();

    const end = this.previous().position;

    return {
      kind: 'ProviderBlock',
      provider_name,
      body,
      span: this.create_span(start, end),
    };
  }

  private parse_module_block(): ModuleBlock {
    const start = this.current().position;
    this.consume('MODULE', "Expected 'module'");

    const name = this.parse_identifier();
    this.consume('LEFT_BRACE', "Expected '{'");

    let source: StringLiteral | undefined;
    let version: StringLiteral | undefined;
    const attributes: Attribute[] = [];

    while (!this.check('RIGHT_BRACE') && !this.is_at_end()) {
      const attr_name = this.parse_identifier();
      this.consume('EQUALS', "Expected '='");

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
          span: this.create_span(attr_name.span.start, this.previous().position),
        });
      }
    }

    this.consume('RIGHT_BRACE', "Expected '}'");
    const end = this.previous().position;

    if (!source) {
      this.add_error("Module block requires 'source' attribute");
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
    const start = this.current().position;
    this.consume('LOCALS', "Expected 'locals'");
    this.consume('LEFT_BRACE', "Expected '{'");

    const values: Record<string, Expression> = {};

    while (!this.check('RIGHT_BRACE') && !this.is_at_end()) {
      const name = this.parse_identifier();
      this.consume('EQUALS', "Expected '='");
      const value = this.parse_expression();
      values[name.name] = value;
    }

    this.consume('RIGHT_BRACE', "Expected '}'");
    const end = this.previous().position;

    return {
      kind: 'LocalsBlock',
      values,
      span: this.create_span(start, end),
    };
  }

  private parse_import_statement(): ImportStatement {
    const start = this.current().position;
    this.consume('IMPORT', "Expected 'import'");

    const path = this.parse_string_literal();

    let alias: Identifier | undefined;
    if (this.match('IDENTIFIER')) {
      // Check for "as" keyword
      if (this.previous().value === 'as') {
        alias = this.parse_identifier();
      }
    }

    const end = this.previous().position;

    return {
      kind: 'ImportStatement',
      path,
      alias,
      span: this.create_span(start, end),
    };
  }

  private parse_block(): Block {
    const start = this.current().position;
    this.consume('LEFT_BRACE', "Expected '{'");

    const attributes: Attribute[] = [];
    const blocks: NestedBlock[] = [];

    while (!this.check('RIGHT_BRACE') && !this.is_at_end()) {
      const name = this.parse_identifier();

      if (this.check('EQUALS')) {
        // Attribute
        this.advance();
        const value = this.parse_expression();
        attributes.push({
          kind: 'Attribute',
          name,
          value,
          span: this.create_span(name.span.start, this.previous().position),
        });
      } else if (this.check('LEFT_BRACE') || this.check('STRING') || this.check('IDENTIFIER')) {
        // Nested block
        const labels: string[] = [];
        while (this.check('STRING') || this.check('IDENTIFIER')) {
          if (this.check('STRING')) {
            labels.push(this.advance().literal as string);
          } else {
            labels.push(this.advance().value);
          }
        }
        const nested_body = this.parse_block();
        blocks.push({
          type: name.name,
          labels,
          body: nested_body,
        });
      } else {
        this.add_error(`Unexpected token after identifier '${name.name}'`);
        this.synchronize();
      }
    }

    this.consume('RIGHT_BRACE', "Expected '}'");
    const end = this.previous().position;

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

    if (this.match('QUESTION')) {
      const start = expr.span.start;
      const then_branch = this.parse_expression();
      this.consume('COLON', "Expected ':' in conditional");
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

    while (this.match('OR')) {
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

    while (this.match('AND')) {
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

    while (this.match('EQUALS_EQUALS', 'NOT_EQUALS')) {
      const operator = (this.previous().value === '==' ? '==' : '!=') as BinaryOperator;
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

    while (this.match('LESS_THAN', 'LESS_THAN_EQUALS', 'GREATER_THAN', 'GREATER_THAN_EQUALS')) {
      const token = this.previous();
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

    while (this.match('PLUS', 'MINUS')) {
      const operator = this.previous().value as BinaryOperator;
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

    while (this.match('STAR', 'SLASH', 'PERCENT')) {
      const operator = this.previous().value as BinaryOperator;
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
    if (this.match('NOT', 'MINUS')) {
      const start = this.previous().position;
      const operator = this.previous().value as UnaryOperator;
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
      if (this.match('DOT')) {
        const property = this.parse_identifier();
        expr = {
          kind: 'PropertyAccess',
          object: expr,
          property,
          span: this.create_span(expr.span.start, property.span.end),
        } as PropertyAccess;
      } else if (this.match('LEFT_BRACKET')) {
        const index = this.parse_expression();
        this.consume('RIGHT_BRACKET', "Expected ']'");
        const end = this.previous().position;
        expr = {
          kind: 'IndexAccess',
          object: expr,
          index,
          span: this.create_span(expr.span.start, end),
        } as IndexAccess;
      } else if (this.match('LEFT_PAREN')) {
        // Function call
        const args: Expression[] = [];
        if (!this.check('RIGHT_PAREN')) {
          do {
            args.push(this.parse_expression());
          } while (this.match('COMMA'));
        }
        this.consume('RIGHT_PAREN', "Expected ')'");
        const end = this.previous().position;

        if (expr.kind !== 'Identifier') {
          this.add_error('Expected function name');
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
    const token = this.current();

    if (this.match('STRING')) {
      return {
        kind: 'StringLiteral',
        value: token.literal as string,
        span: this.create_span(token.position, token.position),
      } as StringLiteral;
    }

    if (this.match('NUMBER')) {
      return {
        kind: 'NumberLiteral',
        value: token.literal as number,
        span: this.create_span(token.position, token.position),
      } as NumberLiteral;
    }

    if (this.match('BOOLEAN')) {
      return {
        kind: 'BooleanLiteral',
        value: token.literal as boolean,
        span: this.create_span(token.position, token.position),
      } as BooleanLiteral;
    }

    if (this.match('NULL')) {
      return {
        kind: 'NullLiteral',
        span: this.create_span(token.position, token.position),
      } as NullLiteral;
    }

    if (this.match('LEFT_BRACKET')) {
      return this.parse_array_expression(token.position);
    }

    if (this.match('LEFT_BRACE')) {
      return this.parse_object_expression(token.position);
    }

    if (this.match('LEFT_PAREN')) {
      const expr = this.parse_expression();
      this.consume('RIGHT_PAREN', "Expected ')'");
      return expr;
    }

    if (this.match('FOR')) {
      return this.parse_for_expression(token.position);
    }

    if (this.match('TYPE_IDENTIFIER')) {
      return {
        kind: 'TypeIdentifier',
        name: token.value,
        span: this.create_span(token.position, token.position),
      } as TypeIdentifier;
    }

    if (this.match('IDENTIFIER')) {
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

    this.add_error(`Unexpected token ${describe_token(token.type)}`);
    this.advance();
    return this.create_null_literal(token.position);
  }

  private parse_array_expression(start: SourcePosition): ArrayExpression {
    const elements: Expression[] = [];

    if (!this.check('RIGHT_BRACKET')) {
      do {
        if (this.check('RIGHT_BRACKET')) break;
        elements.push(this.parse_expression());
      } while (this.match('COMMA'));
    }

    this.consume('RIGHT_BRACKET', "Expected ']'");
    const end = this.previous().position;

    return {
      kind: 'ArrayExpression',
      elements,
      span: this.create_span(start, end),
    };
  }

  private parse_object_expression(start: SourcePosition): ObjectExpression {
    const properties: ObjectProperty[] = [];

    if (!this.check('RIGHT_BRACE')) {
      do {
        if (this.check('RIGHT_BRACE')) break;

        let key: Expression;
        let computed = false;

        if (this.match('LEFT_PAREN')) {
          key = this.parse_expression();
          this.consume('RIGHT_PAREN', "Expected ')'");
          computed = true;
        } else if (this.check('STRING')) {
          key = this.parse_string_literal();
        } else {
          key = this.parse_identifier();
        }

        this.consume('EQUALS', "Expected '=' or ':'");
        const value = this.parse_expression();

        properties.push({ key, value, computed });
      } while (this.match('COMMA'));
    }

    this.consume('RIGHT_BRACE', "Expected '}'");
    const end = this.previous().position;

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

    if (this.match('COMMA')) {
      key_var = first_var;
      value_var = this.parse_identifier();
    } else {
      value_var = first_var;
    }

    this.consume('IN', "Expected 'in'");
    const collection = this.parse_expression();
    this.consume('COLON', "Expected ':'");

    let key_expr: Expression | undefined;
    const value_expr = this.parse_expression();

    if (this.match('FAT_ARROW')) {
      key_expr = value_expr;
    }

    let condition: Expression | undefined;
    if (this.match('IF')) {
      condition = this.parse_expression();
    }

    this.consume('RIGHT_BRACKET', "Expected ']' or '}'");
    const end = this.previous().position;

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
    this.consume('DOT', "Expected '.' after reference type");

    let type_name: string | undefined;
    let name: string;
    const path: string[] = [];

    if (ref_type === 'data') {
      type_name = this.parse_identifier().name;
      this.consume('DOT', "Expected '.' after data type");
      name = this.parse_identifier().name;
    } else {
      name = this.parse_identifier().name;
    }

    while (this.match('DOT')) {
      path.push(this.parse_identifier().name);
    }

    const end = this.previous().position;

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
    const token = this.consume('IDENTIFIER', 'Expected identifier');
    return {
      kind: 'Identifier',
      name: token.value,
      span: this.create_span(token.position, token.position),
    };
  }

  private parse_type_identifier(): TypeIdentifier {
    let name = '';
    const start = this.current().position;

    // Handle both "Ec2.Instance" and "aws_instance" style types
    if (this.check('TYPE_IDENTIFIER')) {
      const token = this.advance();
      name = token.value;
    } else if (this.check('IDENTIFIER')) {
      name = this.advance().value;
      while (this.match('DOT')) {
        name += '.';
        if (this.check('IDENTIFIER') || this.check('TYPE_IDENTIFIER')) {
          name += this.advance().value;
        }
      }
    } else if (this.check('STRING')) {
      name = this.advance().literal as string;
    } else {
      this.add_error('Expected type identifier');
    }

    const end = this.previous().position;

    return {
      kind: 'TypeIdentifier',
      name,
      span: this.create_span(start, end),
    };
  }

  private parse_string_literal(): StringLiteral {
    const token = this.consume('STRING', 'Expected string');
    return {
      kind: 'StringLiteral',
      value: token.literal as string,
      span: this.create_span(token.position, token.position),
    };
  }

  private parse_boolean_literal(): BooleanLiteral | null {
    if (this.check('BOOLEAN')) {
      const token = this.advance();
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

  // ---------------------------------------------------------------------------
  // Token Navigation
  // ---------------------------------------------------------------------------

  private current(): Token {
    return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1]!;
  }

  private previous(): Token {
    return this.tokens[Math.max(0, this.pos - 1)]!;
  }

  private advance(): Token {
    if (!this.is_at_end()) {
      this.pos++;
    }
    return this.previous();
  }

  private check(...types: TokenType[]): boolean {
    return types.includes(this.current().type);
  }

  private match(...types: TokenType[]): boolean {
    if (this.check(...types)) {
      this.advance();
      return true;
    }
    return false;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) {
      return this.advance();
    }
    this.add_error(message);
    return this.current();
  }

  private is_at_end(): boolean {
    return this.current().type === 'EOF';
  }

  private add_error(message: string): void {
    this.errors.push({
      message,
      position: this.current().position,
      token: this.current(),
    });
  }

  private synchronize(): void {
    this.advance();

    while (!this.is_at_end()) {
      // Synchronize at statement boundaries
      if (this.check('RESOURCE', 'DATA', 'VARIABLE', 'OUTPUT', 'PROVIDER', 'MODULE', 'LOCALS', 'IMPORT')) {
        return;
      }

      // Also synchronize at closing brace
      if (this.previous().type === 'RIGHT_BRACE') {
        return;
      }

      this.advance();
    }
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
