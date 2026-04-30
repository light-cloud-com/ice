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
  ls_peek_next,
  ls_advance,
  ls_match,
  ls_skip_whitespace,
  ls_current_position,
  ls_add_token,
  ls_add_token_with_literal,
  ls_add_error,
} from './lexer-state.js';
import {
  is_alpha,
  is_digit,
  scan_block_comment,
  scan_identifier,
  scan_line_comment,
  scan_number,
} from './lexer-scanners.js';

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
          this.scan_heredoc(start_pos, start_line, start_column);
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
        this.scan_string(start_pos, start_line, start_column);
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

  /**
   * Scan a string literal.
   */
  private scan_string(start_pos: number, start_line: number, start_column: number): void {
    const parts: string[] = [];

    while (!ls_is_at_end(this.state) && ls_peek(this.state) !== '"') {
      if (ls_peek(this.state) === '\\') {
        // Escape sequence
        ls_advance(this.state);
        if (!ls_is_at_end(this.state)) {
          const escaped = ls_advance(this.state);
          switch (escaped) {
            case 'n':
              parts.push('\n');
              break;
            case 't':
              parts.push('\t');
              break;
            case 'r':
              parts.push('\r');
              break;
            case '\\':
              parts.push('\\');
              break;
            case '"':
              parts.push('"');
              break;
            case '$':
              parts.push('$');
              break;
            default:
              ls_add_error(this.state, `Invalid escape sequence '\\${escaped}'`, true);
              parts.push(escaped);
          }
        }
      } else if (ls_peek(this.state) === '$' && ls_peek_next(this.state) === '{') {
        // String interpolation - for now, just include as literal
        parts.push(ls_advance(this.state));
      } else if (ls_peek(this.state) === '\n') {
        ls_add_error(this.state, 'Unterminated string literal', true);
        break;
      } else {
        parts.push(ls_advance(this.state));
      }
    }

    if (ls_is_at_end(this.state)) {
      ls_add_error(this.state, 'Unterminated string literal', true);
      return;
    }

    // Consume closing quote
    ls_advance(this.state);

    const value = parts.join('');
    const raw = this.state.source.slice(start_pos, this.state.pos);

    ls_add_token_with_literal(this.state, 'STRING', raw, start_pos, start_line, start_column, value);
  }

  /**
   * Scan a heredoc string.
   */
  private scan_heredoc(start_pos: number, start_line: number, start_column: number): void {
    // Skip optional '-' for indented heredoc
    const indented = ls_match(this.state, '-');

    // Read delimiter identifier
    const delimiter_start = this.state.pos;
    while (
      is_alpha(ls_peek(this.state)) ||
      is_digit(ls_peek(this.state)) ||
      ls_peek(this.state) === '_'
    ) {
      ls_advance(this.state);
    }
    const delimiter = this.state.source.slice(delimiter_start, this.state.pos);

    if (delimiter.length === 0) {
      ls_add_error(this.state, 'Expected heredoc delimiter', true);
      return;
    }

    // Skip to end of line
    while (!ls_is_at_end(this.state) && ls_peek(this.state) !== '\n') {
      ls_advance(this.state);
    }
    if (!ls_is_at_end(this.state)) {
      ls_advance(this.state); // consume newline
      this.state.line++;
      this.state.column = 1;
    }

    // Read content until we find the closing delimiter
    const content_start = this.state.pos;
    let content_end = this.state.pos;

    while (!ls_is_at_end(this.state)) {
      // Check for delimiter at start of line
      const line_start = this.state.pos;

      // Skip leading whitespace for indented heredocs
      if (indented) {
        while (ls_peek(this.state) === ' ' || ls_peek(this.state) === '\t') {
          ls_advance(this.state);
        }
      }

      // Check if this line is the delimiter
      let is_delimiter = true;
      const check_start = this.state.pos;
      for (let i = 0; i < delimiter.length; i++) {
        if (ls_peek(this.state) !== delimiter[i]) {
          is_delimiter = false;
          break;
        }
        ls_advance(this.state);
      }

      // Check for end of line or file after delimiter
      if (
        is_delimiter &&
        (ls_is_at_end(this.state) || ls_peek(this.state) === '\n' || ls_peek(this.state) === '\r')
      ) {
        content_end = line_start;
        break;
      }

      // Not the delimiter, reset and continue
      this.state.pos = check_start;

      // Read until end of line
      while (!ls_is_at_end(this.state) && ls_peek(this.state) !== '\n') {
        ls_advance(this.state);
      }
      if (!ls_is_at_end(this.state)) {
        ls_advance(this.state); // consume newline
        this.state.line++;
        this.state.column = 1;
      }
    }

    const content = this.state.source.slice(content_start, content_end);
    const raw = this.state.source.slice(start_pos, this.state.pos);

    ls_add_token_with_literal(
      this.state,
      'STRING',
      raw,
      start_pos,
      start_line,
      start_column,
      content.trimEnd(),
    );
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
