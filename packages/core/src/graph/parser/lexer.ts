/**
 * ICE Language Lexer
 *
 * Converts source code into a stream of tokens.
 * Handles string interpolation, heredocs, and error recovery.
 */

import { create_token, create_position, get_keyword_type } from './tokens.js';
import type { Token, TokenType, SourcePosition } from './tokens.js';

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

const DEFAULT_OPTIONS: Required<LexerOptions> = {
  file: '<input>',
  include_comments: false,
  include_newlines: false,
  max_errors: 100,
};

// =============================================================================
// Lexer Implementation
// =============================================================================

/**
 * ICE language lexer.
 */
export class Lexer {
  private readonly source: string;
  private readonly options: Required<LexerOptions>;

  private pos = 0;
  private line = 1;
  private column = 1;
  private tokens: Token[] = [];
  private errors: LexerError[] = [];

  constructor(source: string, options: Partial<LexerOptions> = {}) {
    this.source = source;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Tokenize the source code.
   */
  tokenize(): LexerResult {
    while (!this.is_at_end()) {
      if (this.errors.length >= this.options.max_errors) {
        this.add_error('Too many errors, stopping lexer', false);
        break;
      }

      this.scan_token();
    }

    // Add EOF token
    this.tokens.push(create_token('EOF', '', this.current_position(0)));

    return {
      tokens: this.tokens,
      errors: this.errors,
    };
  }

  /**
   * Scan the next token.
   */
  private scan_token(): void {
    this.skip_whitespace();

    if (this.is_at_end()) return;

    const start_pos = this.pos;
    const start_line = this.line;
    const start_column = this.column;

    const char = this.advance();

    switch (char) {
      // Single character tokens
      case '(':
        this.add_token('LEFT_PAREN', '(', start_pos, start_line, start_column);
        break;
      case ')':
        this.add_token('RIGHT_PAREN', ')', start_pos, start_line, start_column);
        break;
      case '{':
        this.add_token('LEFT_BRACE', '{', start_pos, start_line, start_column);
        break;
      case '}':
        this.add_token('RIGHT_BRACE', '}', start_pos, start_line, start_column);
        break;
      case '[':
        this.add_token('LEFT_BRACKET', '[', start_pos, start_line, start_column);
        break;
      case ']':
        this.add_token('RIGHT_BRACKET', ']', start_pos, start_line, start_column);
        break;
      case ',':
        this.add_token('COMMA', ',', start_pos, start_line, start_column);
        break;
      case ';':
        this.add_token('SEMICOLON', ';', start_pos, start_line, start_column);
        break;
      case ':':
        this.add_token('COLON', ':', start_pos, start_line, start_column);
        break;
      case '?':
        this.add_token('QUESTION', '?', start_pos, start_line, start_column);
        break;
      case '+':
        this.add_token('PLUS', '+', start_pos, start_line, start_column);
        break;
      case '*':
        this.add_token('STAR', '*', start_pos, start_line, start_column);
        break;
      case '%':
        this.add_token('PERCENT', '%', start_pos, start_line, start_column);
        break;

      // Two character tokens
      case '=':
        if (this.match('=')) {
          this.add_token('EQUALS_EQUALS', '==', start_pos, start_line, start_column);
        } else if (this.match('>')) {
          this.add_token('FAT_ARROW', '=>', start_pos, start_line, start_column);
        } else {
          this.add_token('EQUALS', '=', start_pos, start_line, start_column);
        }
        break;

      case '!':
        if (this.match('=')) {
          this.add_token('NOT_EQUALS', '!=', start_pos, start_line, start_column);
        } else {
          this.add_token('NOT', '!', start_pos, start_line, start_column);
        }
        break;

      case '<':
        if (this.match('=')) {
          this.add_token('LESS_THAN_EQUALS', '<=', start_pos, start_line, start_column);
        } else if (this.match('<')) {
          this.scan_heredoc(start_pos, start_line, start_column);
        } else {
          this.add_token('LESS_THAN', '<', start_pos, start_line, start_column);
        }
        break;

      case '>':
        if (this.match('=')) {
          this.add_token('GREATER_THAN_EQUALS', '>=', start_pos, start_line, start_column);
        } else {
          this.add_token('GREATER_THAN', '>', start_pos, start_line, start_column);
        }
        break;

      case '&':
        if (this.match('&')) {
          this.add_token('AND', '&&', start_pos, start_line, start_column);
        } else {
          this.add_error(`Unexpected character '&'`, true);
        }
        break;

      case '|':
        if (this.match('|')) {
          this.add_token('OR', '||', start_pos, start_line, start_column);
        } else {
          this.add_error(`Unexpected character '|'`, true);
        }
        break;

      case '-':
        if (this.match('>')) {
          this.add_token('ARROW', '->', start_pos, start_line, start_column);
        } else if (this.is_digit(this.peek())) {
          this.scan_number(start_pos, start_line, start_column, true);
        } else {
          this.add_token('MINUS', '-', start_pos, start_line, start_column);
        }
        break;

      case '.':
        if (this.match('.')) {
          if (this.match('.')) {
            this.add_token('SPREAD', '...', start_pos, start_line, start_column);
          } else {
            this.add_token('DOTDOT', '..', start_pos, start_line, start_column);
          }
        } else {
          this.add_token('DOT', '.', start_pos, start_line, start_column);
        }
        break;

      // Comments and division
      case '/':
        if (this.match('/')) {
          this.scan_line_comment(start_pos, start_line, start_column);
        } else if (this.match('*')) {
          this.scan_block_comment(start_pos, start_line, start_column);
        } else {
          this.add_token('SLASH', '/', start_pos, start_line, start_column);
        }
        break;

      // Hash comments (like HCL)
      case '#':
        this.scan_line_comment(start_pos, start_line, start_column);
        break;

      // Strings
      case '"':
        this.scan_string(start_pos, start_line, start_column);
        break;

      // Newlines
      case '\n':
        if (this.options.include_newlines) {
          this.add_token('NEWLINE', '\n', start_pos, start_line, start_column);
        }
        this.line++;
        this.column = 1;
        break;

      case '\r':
        if (this.match('\n')) {
          if (this.options.include_newlines) {
            this.add_token('NEWLINE', '\r\n', start_pos, start_line, start_column);
          }
        }
        this.line++;
        this.column = 1;
        break;

      default:
        if (this.is_digit(char)) {
          this.scan_number(start_pos, start_line, start_column, false);
        } else if (this.is_alpha(char)) {
          this.scan_identifier(start_pos, start_line, start_column);
        } else {
          this.add_error(`Unexpected character '${char}'`, true);
        }
        break;
    }
  }

  /**
   * Scan a string literal.
   */
  private scan_string(start_pos: number, start_line: number, start_column: number): void {
    const parts: string[] = [];

    while (!this.is_at_end() && this.peek() !== '"') {
      if (this.peek() === '\\') {
        // Escape sequence
        this.advance();
        if (!this.is_at_end()) {
          const escaped = this.advance();
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
              this.add_error(`Invalid escape sequence '\\${escaped}'`, true);
              parts.push(escaped);
          }
        }
      } else if (this.peek() === '$' && this.peek_next() === '{') {
        // String interpolation - for now, just include as literal
        parts.push(this.advance());
      } else if (this.peek() === '\n') {
        this.add_error('Unterminated string literal', true);
        break;
      } else {
        parts.push(this.advance());
      }
    }

    if (this.is_at_end()) {
      this.add_error('Unterminated string literal', true);
      return;
    }

    // Consume closing quote
    this.advance();

    const value = parts.join('');
    const raw = this.source.slice(start_pos, this.pos);

    this.add_token_with_literal('STRING', raw, start_pos, start_line, start_column, value);
  }

  /**
   * Scan a number literal.
   */
  private scan_number(start_pos: number, start_line: number, start_column: number, _negative: boolean): void {
    // Integer part
    while (this.is_digit(this.peek())) {
      this.advance();
    }

    // Decimal part
    if (this.peek() === '.' && this.is_digit(this.peek_next())) {
      this.advance(); // consume '.'
      while (this.is_digit(this.peek())) {
        this.advance();
      }
    }

    // Exponent part
    if (this.peek() === 'e' || this.peek() === 'E') {
      this.advance();
      if (this.peek() === '+' || this.peek() === '-') {
        this.advance();
      }
      if (!this.is_digit(this.peek())) {
        this.add_error('Invalid number: expected exponent', true);
        return;
      }
      while (this.is_digit(this.peek())) {
        this.advance();
      }
    }

    const value = this.source.slice(start_pos, this.pos);
    const num = parseFloat(value);

    this.add_token_with_literal('NUMBER', value, start_pos, start_line, start_column, num);
  }

  /**
   * Scan an identifier or keyword.
   */
  private scan_identifier(start_pos: number, start_line: number, start_column: number): void {
    while (this.is_alphanumeric(this.peek())) {
      this.advance();
    }

    const value = this.source.slice(start_pos, this.pos);
    const keyword_type = get_keyword_type(value);

    if (keyword_type) {
      if (keyword_type === 'TRUE') {
        this.add_token_with_literal('BOOLEAN', value, start_pos, start_line, start_column, true);
      } else if (keyword_type === 'FALSE') {
        this.add_token_with_literal('BOOLEAN', value, start_pos, start_line, start_column, false);
      } else if (keyword_type === 'NULL_KEYWORD') {
        this.add_token_with_literal('NULL', value, start_pos, start_line, start_column, null);
      } else {
        this.add_token(keyword_type, value, start_pos, start_line, start_column);
      }
    } else {
      // Check if it looks like a type identifier (contains a dot or starts with uppercase)
      const is_type = value.includes('.') || /^[A-Z]/.test(value);
      this.add_token(is_type ? 'TYPE_IDENTIFIER' : 'IDENTIFIER', value, start_pos, start_line, start_column);
    }
  }

  /**
   * Scan a line comment.
   */
  private scan_line_comment(start_pos: number, start_line: number, start_column: number): void {
    while (!this.is_at_end() && this.peek() !== '\n') {
      this.advance();
    }

    if (this.options.include_comments) {
      const value = this.source.slice(start_pos, this.pos);
      this.add_token('COMMENT', value, start_pos, start_line, start_column);
    }
  }

  /**
   * Scan a block comment.
   */
  private scan_block_comment(start_pos: number, start_line: number, start_column: number): void {
    let depth = 1;

    while (!this.is_at_end() && depth > 0) {
      if (this.peek() === '/' && this.peek_next() === '*') {
        this.advance();
        this.advance();
        depth++;
      } else if (this.peek() === '*' && this.peek_next() === '/') {
        this.advance();
        this.advance();
        depth--;
      } else {
        if (this.peek() === '\n') {
          this.line++;
          this.column = 0;
        }
        this.advance();
      }
    }

    if (depth > 0) {
      this.add_error('Unterminated block comment', true);
    }

    if (this.options.include_comments) {
      const value = this.source.slice(start_pos, this.pos);
      this.add_token('COMMENT', value, start_pos, start_line, start_column);
    }
  }

  /**
   * Scan a heredoc string.
   */
  private scan_heredoc(start_pos: number, start_line: number, start_column: number): void {
    // Skip optional '-' for indented heredoc
    const indented = this.match('-');

    // Read delimiter identifier
    const delimiter_start = this.pos;
    while (this.is_alpha(this.peek()) || this.is_digit(this.peek()) || this.peek() === '_') {
      this.advance();
    }
    const delimiter = this.source.slice(delimiter_start, this.pos);

    if (delimiter.length === 0) {
      this.add_error('Expected heredoc delimiter', true);
      return;
    }

    // Skip to end of line
    while (!this.is_at_end() && this.peek() !== '\n') {
      this.advance();
    }
    if (!this.is_at_end()) {
      this.advance(); // consume newline
      this.line++;
      this.column = 1;
    }

    // Read content until we find the closing delimiter
    const content_start = this.pos;
    let content_end = this.pos;

    while (!this.is_at_end()) {
      // Check for delimiter at start of line
      const line_start = this.pos;

      // Skip leading whitespace for indented heredocs
      if (indented) {
        while (this.peek() === ' ' || this.peek() === '\t') {
          this.advance();
        }
      }

      // Check if this line is the delimiter
      let is_delimiter = true;
      const check_start = this.pos;
      for (let i = 0; i < delimiter.length; i++) {
        if (this.peek() !== delimiter[i]) {
          is_delimiter = false;
          break;
        }
        this.advance();
      }

      // Check for end of line or file after delimiter
      if (is_delimiter && (this.is_at_end() || this.peek() === '\n' || this.peek() === '\r')) {
        content_end = line_start;
        break;
      }

      // Not the delimiter, reset and continue
      this.pos = check_start;

      // Read until end of line
      while (!this.is_at_end() && this.peek() !== '\n') {
        this.advance();
      }
      if (!this.is_at_end()) {
        this.advance(); // consume newline
        this.line++;
        this.column = 1;
      }
    }

    const content = this.source.slice(content_start, content_end);
    const raw = this.source.slice(start_pos, this.pos);

    this.add_token_with_literal('STRING', raw, start_pos, start_line, start_column, content.trimEnd());
  }

  // ---------------------------------------------------------------------------
  // Helper Methods
  // ---------------------------------------------------------------------------

  private is_at_end(): boolean {
    return this.pos >= this.source.length;
  }

  private peek(): string {
    if (this.is_at_end()) return '\0';
    return this.source[this.pos] ?? '\0';
  }

  private peek_next(): string {
    if (this.pos + 1 >= this.source.length) return '\0';
    return this.source[this.pos + 1] ?? '\0';
  }

  private advance(): string {
    const char = this.source[this.pos] ?? '\0';
    this.pos++;
    this.column++;
    return char;
  }

  private match(expected: string): boolean {
    if (this.is_at_end()) return false;
    if (this.source[this.pos] !== expected) return false;
    this.pos++;
    this.column++;
    return true;
  }

  private skip_whitespace(): void {
    while (!this.is_at_end()) {
      const char = this.peek();
      switch (char) {
        case ' ':
        case '\t':
          this.advance();
          break;
        default:
          return;
      }
    }
  }

  private is_digit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private is_alpha(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_';
  }

  private is_alphanumeric(char: string): boolean {
    return this.is_alpha(char) || this.is_digit(char);
  }

  private current_position(length: number): SourcePosition {
    return create_position(this.line, this.column, this.pos, length, this.options.file);
  }

  private add_token(type: TokenType, value: string, start_pos: number, start_line: number, start_column: number): void {
    const position = create_position(start_line, start_column, start_pos, this.pos - start_pos, this.options.file);
    this.tokens.push(create_token(type, value, position));
  }

  private add_token_with_literal(
    type: TokenType,
    value: string,
    start_pos: number,
    start_line: number,
    start_column: number,
    literal: unknown,
  ): void {
    const position = create_position(start_line, start_column, start_pos, this.pos - start_pos, this.options.file);
    this.tokens.push(create_token(type, value, position, literal));
  }

  private add_error(message: string, recoverable: boolean): void {
    this.errors.push({
      message,
      position: this.current_position(1),
      recoverable,
    });

    if (recoverable) {
      // Add error token and continue
      this.tokens.push(create_token('ERROR', this.source[this.pos - 1] ?? '', this.current_position(1)));
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
