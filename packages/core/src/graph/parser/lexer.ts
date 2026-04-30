/**
 * ICE Language Lexer
 *
 * Converts source code into a stream of tokens.
 * Handles string interpolation, heredocs, and error recovery.
 */

import { create_token } from './tokens.js';
import type { Token, SourcePosition } from './tokens.js';
import {
  type LexerState,
  make_lexer_state,
  ls_is_at_end,
  ls_peek,
  ls_advance,
  ls_match,
  ls_skip_whitespace,
  ls_current_position,
  ls_add_token,
  ls_add_error,
} from './lexer-state.js';
import {
  is_digit,
  is_alpha,
  scan_block_comment,
  scan_identifier,
  scan_line_comment,
  scan_number,
  scan_string,
} from './lexer-scanners.js';
import { scan_heredoc } from './lexer-heredoc.js';

// =============================================================================
// Lexer Error
// =============================================================================

/**
 * Lexer error with source position.
 */
export interface LexerError {
  readonly message: string;
  readonly position: SourcePosition;
  readonly recoverable: boolean;
}

/**
 * Lexer result containing tokens and errors.
 */
export interface LexerResult {
  readonly tokens: Token[];
  readonly errors: LexerError[];
}

// =============================================================================
// Lexer Configuration
// =============================================================================

/**
 * Lexer configuration options.
 */
export interface LexerOptions {
  /** Source file path for error messages */
  readonly file?: string;

  /** Whether to include comment tokens */
  readonly include_comments?: boolean;

  /** Whether to include newline tokens */
  readonly include_newlines?: boolean;

  /** Maximum errors before stopping */
  readonly max_errors?: number;
}

// `DEFAULT_OPTIONS` lives on `lexer-state.ts` as `DEFAULT_LEXER_OPTIONS`;
// `make_lexer_state` applies it. The class no longer needs a local copy.

// =============================================================================
// Lexer Implementation
// =============================================================================

/**
 * ICE language lexer.
 *
 * The class is a thin lifecycle shell: the constructor builds a
 * `LexerState` from `(source, options)` and stashes it on `this.state`,
 * and every other method passes `this.state` through to the standalone
 * `ls_*` navigation helpers. Field-level mutable state (`pos`, `line`,
 * `column`, `tokens`, `errors`) lives on `state`, not on the class —
 * see `lexer-state.ts` for the full state shape.
 */
export class Lexer {
  private readonly state: LexerState;

  constructor(source: string, options: Partial<LexerOptions> = {}) {
    this.state = make_lexer_state(source, options);
  }

  /**
   * Tokenize the source code.
   */
  tokenize(): LexerResult {
    while (!ls_is_at_end(this.state)) {
      if (this.state.errors.length >= this.state.options.max_errors) {
        ls_add_error(this.state, 'Too many errors, stopping lexer', false);
        break;
      }

      this.scan_token();
    }

    // Add EOF token
    this.state.tokens.push(create_token('EOF', '', ls_current_position(this.state, 0)));

    return {
      tokens: this.state.tokens,
      errors: this.state.errors,
    };
  }

  /**
   * Scan the next token.
   */
  private scan_token(): void {
    ls_skip_whitespace(this.state);

    if (ls_is_at_end(this.state)) return;

    const start_pos = this.state.pos;
    const start_line = this.state.line;
    const start_column = this.state.column;

    const char = ls_advance(this.state);

    switch (char) {
      // Single character tokens
      case '(':
        ls_add_token(this.state, 'LEFT_PAREN', '(', start_pos, start_line, start_column);
        break;
      case ')':
        ls_add_token(this.state, 'RIGHT_PAREN', ')', start_pos, start_line, start_column);
        break;
      case '{':
        ls_add_token(this.state, 'LEFT_BRACE', '{', start_pos, start_line, start_column);
        break;
      case '}':
        ls_add_token(this.state, 'RIGHT_BRACE', '}', start_pos, start_line, start_column);
        break;
      case '[':
        ls_add_token(this.state, 'LEFT_BRACKET', '[', start_pos, start_line, start_column);
        break;
      case ']':
        ls_add_token(this.state, 'RIGHT_BRACKET', ']', start_pos, start_line, start_column);
        break;
      case ',':
        ls_add_token(this.state, 'COMMA', ',', start_pos, start_line, start_column);
        break;
      case ';':
        ls_add_token(this.state, 'SEMICOLON', ';', start_pos, start_line, start_column);
        break;
      case ':':
        ls_add_token(this.state, 'COLON', ':', start_pos, start_line, start_column);
        break;
      case '?':
        ls_add_token(this.state, 'QUESTION', '?', start_pos, start_line, start_column);
        break;
      case '+':
        ls_add_token(this.state, 'PLUS', '+', start_pos, start_line, start_column);
        break;
      case '*':
        ls_add_token(this.state, 'STAR', '*', start_pos, start_line, start_column);
        break;
      case '%':
        ls_add_token(this.state, 'PERCENT', '%', start_pos, start_line, start_column);
        break;

      // Two character tokens
      case '=':
        if (ls_match(this.state, '=')) {
          ls_add_token(this.state, 'EQUALS_EQUALS', '==', start_pos, start_line, start_column);
        } else if (ls_match(this.state, '>')) {
          ls_add_token(this.state, 'FAT_ARROW', '=>', start_pos, start_line, start_column);
        } else {
          ls_add_token(this.state, 'EQUALS', '=', start_pos, start_line, start_column);
        }
        break;

      case '!':
        if (ls_match(this.state, '=')) {
          ls_add_token(this.state, 'NOT_EQUALS', '!=', start_pos, start_line, start_column);
        } else {
          ls_add_token(this.state, 'NOT', '!', start_pos, start_line, start_column);
        }
        break;

      case '<':
        if (ls_match(this.state, '=')) {
          ls_add_token(this.state, 'LESS_THAN_EQUALS', '<=', start_pos, start_line, start_column);
        } else if (ls_match(this.state, '<')) {
          scan_heredoc(this.state, start_pos, start_line, start_column);
        } else {
          ls_add_token(this.state, 'LESS_THAN', '<', start_pos, start_line, start_column);
        }
        break;

      case '>':
        if (ls_match(this.state, '=')) {
          ls_add_token(this.state, 'GREATER_THAN_EQUALS', '>=', start_pos, start_line, start_column);
        } else {
          ls_add_token(this.state, 'GREATER_THAN', '>', start_pos, start_line, start_column);
        }
        break;

      case '&':
        if (ls_match(this.state, '&')) {
          ls_add_token(this.state, 'AND', '&&', start_pos, start_line, start_column);
        } else {
          ls_add_error(this.state, `Unexpected character '&'`, true);
        }
        break;

      case '|':
        if (ls_match(this.state, '|')) {
          ls_add_token(this.state, 'OR', '||', start_pos, start_line, start_column);
        } else {
          ls_add_error(this.state, `Unexpected character '|'`, true);
        }
        break;

      case '-':
        if (ls_match(this.state, '>')) {
          ls_add_token(this.state, 'ARROW', '->', start_pos, start_line, start_column);
        } else if (is_digit(ls_peek(this.state))) {
          scan_number(this.state, start_pos, start_line, start_column, true);
        } else {
          ls_add_token(this.state, 'MINUS', '-', start_pos, start_line, start_column);
        }
        break;

      case '.':
        if (ls_match(this.state, '.')) {
          if (ls_match(this.state, '.')) {
            ls_add_token(this.state, 'SPREAD', '...', start_pos, start_line, start_column);
          } else {
            ls_add_token(this.state, 'DOTDOT', '..', start_pos, start_line, start_column);
          }
        } else {
          ls_add_token(this.state, 'DOT', '.', start_pos, start_line, start_column);
        }
        break;

      // Comments and division
      case '/':
        if (ls_match(this.state, '/')) {
          scan_line_comment(this.state, start_pos, start_line, start_column);
        } else if (ls_match(this.state, '*')) {
          scan_block_comment(this.state, start_pos, start_line, start_column);
        } else {
          ls_add_token(this.state, 'SLASH', '/', start_pos, start_line, start_column);
        }
        break;

      // Hash comments (like HCL)
      case '#':
        scan_line_comment(this.state, start_pos, start_line, start_column);
        break;

      // Strings
      case '"':
        scan_string(this.state, start_pos, start_line, start_column);
        break;

      // Newlines
      case '\n':
        if (this.state.options.include_newlines) {
          ls_add_token(this.state, 'NEWLINE', '\n', start_pos, start_line, start_column);
        }
        this.state.line++;
        this.state.column = 1;
        break;

      case '\r':
        if (ls_match(this.state, '\n')) {
          if (this.state.options.include_newlines) {
            ls_add_token(this.state, 'NEWLINE', '\r\n', start_pos, start_line, start_column);
          }
        }
        this.state.line++;
        this.state.column = 1;
        break;

      default:
        if (is_digit(char)) {
          scan_number(this.state, start_pos, start_line, start_column, false);
        } else if (is_alpha(char)) {
          scan_identifier(this.state, start_pos, start_line, start_column);
        } else {
          ls_add_error(this.state, `Unexpected character '${char}'`, true);
        }
        break;
    }
  }

}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a lexer and tokenize source code.
 */
export function tokenize(source: string, options?: Partial<LexerOptions>): LexerResult {
  const lexer = new Lexer(source, options);
  return lexer.tokenize();
}
