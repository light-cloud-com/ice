/**
 * Lexer State (rf-lex-1)
 *
 * `LexerState` carries the cursor + line/column tracking + token
 * buffer + error buffer + options across every helper in the lexer
 * module. The 12 helpers below are direct ports of the class-method
 * versions originally on `Lexer` (see lexer.ts L547-L634
 * pre-extraction); the class now holds a single `state` field and
 * forwards through these helpers.
 *
 * Each helper takes `s: LexerState` as the first arg. Bodies are
 * mechanical: `this.source` -> `s.source`, `this.pos` -> `s.pos`,
 * `this.line` -> `s.line`, `this.column` -> `s.column`,
 * `this.tokens` -> `s.tokens`, `this.errors` -> `s.errors`,
 * `this.options` -> `s.options`. The helpers mutate `s` in place —
 * `LexerState` is treated as a mutable handle, not a value.
 *
 * The `LexerError` and `LexerOptions` types are imported type-only
 * from `./lexer.js` to avoid a runtime cycle.
 */
import { create_token, create_position } from './tokens';
import type { Token, TokenType, SourcePosition } from './tokens';
import type { LexerError, LexerOptions } from './lexer';

/**
 * Default options for the lexer. Mirrors `DEFAULT_OPTIONS` in
 * lexer.ts; centralised here so `make_lexer_state` can fill in
 * absent fields without re-importing the parent module's private
 * constant.
 */
const DEFAULT_LEXER_OPTIONS: Required<LexerOptions> = {
  file: '<input>',
  include_comments: false,
  include_newlines: false,
  max_errors: 100,
};

/**
 * Mutable lexer state shared across navigation + scanner functions.
 *
 * - `source` — the immutable input string.
 * - `pos` — current byte offset; mutated by `ls_advance` / `ls_match`.
 * - `line` — current 1-based line number; mutated when a newline is
 *   consumed (by `\n` outer handler, scan_block_comment, scan_heredoc).
 * - `column` — current 1-based column number; mutated by `ls_advance`
 *   and `ls_match`, reset on newline at outer handler / heredoc.
 *   NOTE: `scan_block_comment` sets `column = 0` BEFORE the trailing
 *   `ls_advance` (which increments to 1) — a deliberate sequence, not
 *   a bug. See RISK #1 in the rf-lex blueprint.
 * - `tokens` — accumulated token list; mutated by `ls_add_token` /
 *   `ls_add_token_with_literal` / `ls_add_error` (recoverable case).
 * - `errors` — accumulated error list; mutated by `ls_add_error`.
 * - `options` — fully-resolved options (no partials) so callers can
 *   read `options.file` / `options.max_errors` etc. without
 *   defaulting at every site.
 */
export interface LexerState {
  readonly source: string;
  pos: number;
  line: number;
  column: number;
  tokens: Token[];
  errors: LexerError[];
  readonly options: Required<LexerOptions>;
}

/**
 * Construct a fresh LexerState. `options` may be partial — missing
 * fields are filled from `DEFAULT_LEXER_OPTIONS`. `pos` starts at 0,
 * `line` at 1, `column` at 1, and `tokens`/`errors` start empty.
 */
export function make_lexer_state(
  source: string,
  options: Partial<LexerOptions> = {},
): LexerState {
  return {
    source,
    pos: 0,
    line: 1,
    column: 1,
    tokens: [],
    errors: [],
    options: { ...DEFAULT_LEXER_OPTIONS, ...options },
  };
}

// =============================================================================
// Navigation
// =============================================================================

/**
 * Whether the cursor has reached the end of the source. Pure read.
 */
export function ls_is_at_end(s: LexerState): boolean {
  return s.pos >= s.source.length;
}

/**
 * Char at the current cursor position; `'\0'` past the end. Pure read.
 */
export function ls_peek(s: LexerState): string {
  if (ls_is_at_end(s)) return '\0';
  return s.source[s.pos] ?? '\0';
}

/**
 * Char one position past the current cursor; `'\0'` past the end.
 * Pure read.
 */
export function ls_peek_next(s: LexerState): string {
  if (s.pos + 1 >= s.source.length) return '\0';
  return s.source[s.pos + 1] ?? '\0';
}

/**
 * Consume the current char and advance the cursor by 1. Increments
 * `column` (NOT `line` — newline-driven line tracking is handled by
 * the callers that consume `\n`). Returns the just-consumed char or
 * `'\0'` past the end.
 */
export function ls_advance(s: LexerState): string {
  const char = s.source[s.pos] ?? '\0';
  s.pos++;
  s.column++;
  return char;
}

/**
 * If the current char equals `expected`, advance and return true.
 * Otherwise leave the cursor where it is and return false. Used for
 * two-char token disambiguation (`==`, `!=`, `&&`, `||`, etc.) and
 * for the heredoc indented-mode `-` detection.
 */
export function ls_match(s: LexerState, expected: string): boolean {
  if (ls_is_at_end(s)) return false;
  if (s.source[s.pos] !== expected) return false;
  s.pos++;
  s.column++;
  return true;
}

/**
 * Skip leading horizontal whitespace (space, tab) before the next
 * token scan. Newlines are NOT skipped here — they are tokens (or
 * line-tracking events) handled by the outer scan_token dispatch.
 */
export function ls_skip_whitespace(s: LexerState): void {
  while (!ls_is_at_end(s)) {
    const char = ls_peek(s);
    switch (char) {
      case ' ':
      case '\t':
        ls_advance(s);
        break;
      default:
        return;
    }
  }
}

// =============================================================================
// Token & Error Construction
// =============================================================================

/**
 * Build a SourcePosition for the current cursor location, with the
 * given `length` field. Used for EOF tokens (length=0) and for
 * error tokens (length=1; see `ls_add_error`).
 */
export function ls_current_position(s: LexerState, length: number): SourcePosition {
  return create_position(s.line, s.column, s.pos, length, s.options.file);
}

/**
 * Append a token of `type` and `value` to `s.tokens`. The position
 * is derived from `(start_line, start_column, start_pos)` — the
 * caller must capture these BEFORE consuming any chars for this
 * token. The length is computed as `s.pos - start_pos` (i.e. how far
 * the cursor moved during the scan).
 */
export function ls_add_token(
  s: LexerState,
  type: TokenType,
  value: string,
  start_pos: number,
  start_line: number,
  start_column: number,
): void {
  const position = create_position(
    start_line,
    start_column,
    start_pos,
    s.pos - start_pos,
    s.options.file,
  );
  s.tokens.push(create_token(type, value, position));
}

/**
 * Append a token with a literal payload (number value, boolean
 * value, parsed string content, etc.). Otherwise identical to
 * `ls_add_token`.
 */
export function ls_add_token_with_literal(
  s: LexerState,
  type: TokenType,
  value: string,
  start_pos: number,
  start_line: number,
  start_column: number,
  literal: unknown,
): void {
  const position = create_position(
    start_line,
    start_column,
    start_pos,
    s.pos - start_pos,
    s.options.file,
  );
  s.tokens.push(create_token(type, value, position, literal));
}

/**
 * Append an error to `s.errors` and (if `recoverable`) push an ERROR
 * token reflecting the offending char.
 *
 * RISK #2 — The ERROR token's `value` is `s.source[s.pos - 1]`, NOT
 * `s.source[s.pos]`. This is because every callsite of `add_error`
 * fires AFTER `advance()` has already consumed the bad char (e.g.
 * the `default:` branch of `scan_token` does `const char =
 * this.advance()` before dispatching). The `pos - 1` snapshot
 * recovers the original char. Do not "fix" this to `pos` — every
 * caller relies on the post-advance shape.
 */
export function ls_add_error(
  s: LexerState,
  message: string,
  recoverable: boolean,
): void {
  s.errors.push({
    message,
    position: ls_current_position(s, 1),
    recoverable,
  });

  if (recoverable) {
    // Add error token and continue.
    s.tokens.push(
      create_token('ERROR', s.source[s.pos - 1] ?? '', ls_current_position(s, 1)),
    );
  }
}
