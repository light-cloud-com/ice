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
  StringLiteral,
  Block,
  Attribute,
  NestedBlock,
} from './ast.js';
import type { Token, SourcePosition } from './tokens.js';
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
import {
  parse_identifier,
  parse_type_identifier,
  parse_string_literal,
  parse_boolean_literal,
  create_null_literal,
  create_span,
} from './parser-literals.js';
import { parse_expression } from './parser-binary-exprs.js';

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
      span: create_span(start, end),
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

    const resource_type = parse_type_identifier(this.state);
    const name = parse_identifier(this.state);
    const body = this.parse_block();

    const end = ps_previous(this.state).position;

    return {
      kind: 'ResourceBlock',
      resource_type,
      name,
      body,
      span: create_span(start, end),
    };
  }

  private parse_data_block(): DataBlock {
    const start = ps_current(this.state).position;
    ps_consume(this.state, 'DATA', "Expected 'data'");

    const data_type = parse_type_identifier(this.state);
    const name = parse_identifier(this.state);
    const body = this.parse_block();

    const end = ps_previous(this.state).position;

    return {
      kind: 'DataBlock',
      data_type,
      name,
      body,
      span: create_span(start, end),
    };
  }

  private parse_variable_block(): VariableBlock {
    const start = ps_current(this.state).position;
    ps_consume(this.state, 'VARIABLE', "Expected 'variable'");

    const name = parse_identifier(this.state);
    ps_consume(this.state, 'LEFT_BRACE', "Expected '{'");

    let description: StringLiteral | undefined;
    let default_value: Expression | undefined;
    let sensitive: boolean | undefined;

    while (!ps_check(this.state, 'RIGHT_BRACE') && !ps_is_at_end(this.state)) {
      const attr_name = parse_identifier(this.state);
      ps_consume(this.state, 'EQUALS', "Expected '='");

      switch (attr_name.name) {
        case 'description':
          description = parse_string_literal(this.state);
          break;
        case 'default':
          default_value = parse_expression(this.state);
          break;
        case 'sensitive':
          sensitive = parse_boolean_literal(this.state)?.value;
          break;
        default:
          parse_expression(this.state); // Skip unknown attributes
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
      span: create_span(start, end),
    };
  }

  private parse_output_block(): OutputBlock {
    const start = ps_current(this.state).position;
    ps_consume(this.state, 'OUTPUT', "Expected 'output'");

    const name = parse_identifier(this.state);
    ps_consume(this.state, 'LEFT_BRACE', "Expected '{'");

    let value: Expression | undefined;
    let description: StringLiteral | undefined;
    let sensitive: boolean | undefined;

    while (!ps_check(this.state, 'RIGHT_BRACE') && !ps_is_at_end(this.state)) {
      const attr_name = parse_identifier(this.state);
      ps_consume(this.state, 'EQUALS', "Expected '='");

      switch (attr_name.name) {
        case 'value':
          value = parse_expression(this.state);
          break;
        case 'description':
          description = parse_string_literal(this.state);
          break;
        case 'sensitive':
          sensitive = parse_boolean_literal(this.state)?.value;
          break;
        default:
          parse_expression(this.state);
      }
    }

    ps_consume(this.state, 'RIGHT_BRACE', "Expected '}'");
    const end = ps_previous(this.state).position;

    if (!value) {
      ps_add_error(this.state, "Output block requires 'value' attribute");
      value = create_null_literal(this.state, start);
    }

    return {
      kind: 'OutputBlock',
      name,
      value,
      description,
      sensitive,
      span: create_span(start, end),
    };
  }

  private parse_provider_block(): ProviderBlock {
    const start = ps_current(this.state).position;
    ps_consume(this.state, 'PROVIDER', "Expected 'provider'");

    const provider_name = parse_identifier(this.state);
    const body = this.parse_block();

    const end = ps_previous(this.state).position;

    return {
      kind: 'ProviderBlock',
      provider_name,
      body,
      span: create_span(start, end),
    };
  }

  private parse_module_block(): ModuleBlock {
    const start = ps_current(this.state).position;
    ps_consume(this.state, 'MODULE', "Expected 'module'");

    const name = parse_identifier(this.state);
    ps_consume(this.state, 'LEFT_BRACE', "Expected '{'");

    let source: StringLiteral | undefined;
    let version: StringLiteral | undefined;
    const attributes: Attribute[] = [];

    while (!ps_check(this.state, 'RIGHT_BRACE') && !ps_is_at_end(this.state)) {
      const attr_name = parse_identifier(this.state);
      ps_consume(this.state, 'EQUALS', "Expected '='");

      if (attr_name.name === 'source') {
        source = parse_string_literal(this.state);
      } else if (attr_name.name === 'version') {
        version = parse_string_literal(this.state);
      } else {
        const value = parse_expression(this.state);
        attributes.push({
          kind: 'Attribute',
          name: attr_name,
          value,
          span: create_span(attr_name.span.start, ps_previous(this.state).position),
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
        span: create_span(start, start),
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
        span: create_span(start, end),
      },
      span: create_span(start, end),
    };
  }

  private parse_locals_block(): LocalsBlock {
    const start = ps_current(this.state).position;
    ps_consume(this.state, 'LOCALS', "Expected 'locals'");
    ps_consume(this.state, 'LEFT_BRACE', "Expected '{'");

    const values: Record<string, Expression> = {};

    while (!ps_check(this.state, 'RIGHT_BRACE') && !ps_is_at_end(this.state)) {
      const name = parse_identifier(this.state);
      ps_consume(this.state, 'EQUALS', "Expected '='");
      const value = parse_expression(this.state);
      values[name.name] = value;
    }

    ps_consume(this.state, 'RIGHT_BRACE', "Expected '}'");
    const end = ps_previous(this.state).position;

    return {
      kind: 'LocalsBlock',
      values,
      span: create_span(start, end),
    };
  }

  private parse_import_statement(): ImportStatement {
    const start = ps_current(this.state).position;
    ps_consume(this.state, 'IMPORT', "Expected 'import'");

    const path = parse_string_literal(this.state);

    let alias: Identifier | undefined;
    if (ps_match(this.state, 'IDENTIFIER')) {
      // Check for "as" keyword
      if (ps_previous(this.state).value === 'as') {
        alias = parse_identifier(this.state);
      }
    }

    const end = ps_previous(this.state).position;

    return {
      kind: 'ImportStatement',
      path,
      alias,
      span: create_span(start, end),
    };
  }

  private parse_block(): Block {
    const start = ps_current(this.state).position;
    ps_consume(this.state, 'LEFT_BRACE', "Expected '{'");

    const attributes: Attribute[] = [];
    const blocks: NestedBlock[] = [];

    while (!ps_check(this.state, 'RIGHT_BRACE') && !ps_is_at_end(this.state)) {
      const name = parse_identifier(this.state);

      if (ps_check(this.state, 'EQUALS')) {
        // Attribute
        ps_advance(this.state);
        const value = parse_expression(this.state);
        attributes.push({
          kind: 'Attribute',
          name,
          value,
          span: create_span(name.span.start, ps_previous(this.state).position),
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
      span: create_span(start, end),
    };
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
