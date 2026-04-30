/**
 * ICE Language Parser
 *
 * Recursive descent parser that builds an AST from tokens.
 */

import { describe_token } from './tokens.js';
import type {
  Program,
  Statement,
} from './ast.js';
import type { Token, SourcePosition } from './tokens.js';
import {
  type ParserState,
  make_parser_state,
  ps_current,
  ps_previous,
  ps_advance,
  ps_is_at_end,
  ps_add_error,
  ps_synchronize,
} from './parser-state.js';
import { create_span } from './parser-literals.js';
import {
  parse_resource_block,
  parse_data_block,
  parse_provider_block,
} from './parser-block-body.js';
import {
  parse_variable_block,
  parse_output_block,
  parse_module_block,
  parse_locals_block,
  parse_import_statement,
} from './parser-statements.js';

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
        return parse_resource_block(this.state);
      case 'DATA':
        return parse_data_block(this.state);
      case 'VARIABLE':
        return parse_variable_block(this.state);
      case 'OUTPUT':
        return parse_output_block(this.state);
      case 'PROVIDER':
        return parse_provider_block(this.state);
      case 'MODULE':
        return parse_module_block(this.state);
      case 'LOCALS':
        return parse_locals_block(this.state);
      case 'IMPORT':
        return parse_import_statement(this.state);
      default:
        ps_add_error(this.state, `Unexpected token ${describe_token(token.type)}`);
        ps_advance(this.state);
        return null;
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
