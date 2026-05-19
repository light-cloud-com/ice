/**
 * Parser State (rf-parse-1)
 *
 * `ParserState` carries the cursor + error buffer + options across
 * every helper in the parser module. The 9 navigation helpers below
 * are direct ports of the class-method versions originally on
 * `Parser` (see parser.ts L985-1048 pre-extraction); the class now
 * holds a single `state` field and forwards through these helpers.
 *
 * Each helper takes `s: ParserState` as the first arg. Bodies are
 * mechanical: `this.tokens` -> `s.tokens`, `this.pos` -> `s.pos`,
 * `this.errors` -> `s.errors`, `this.options` -> `s.options`. Cross
 * calls go through the named helpers (`ps_check(s, ...)`) instead of
 * `this.check(...)`. The helpers mutate `s.pos` / `s.errors` in place
 * — `ParserState` is treated as a mutable handle, not a value.
 *
 * The `ParserError` and `ParserOptions` types are imported type-only
 * from `./parser.js` to avoid a runtime cycle.
 */
import type { ParserError, ParserOptions } from './parser';
import type { Token, TokenType } from './tokens';

/**
 * Default options for the parser. Mirrors `DEFAULT_OPTIONS` in
 * parser.ts; centralised here so `make_parser_state` can fill in
 * absent fields without re-importing the parent module's private
 * constant.
 */
const DEFAULT_PARSER_OPTIONS: Required<ParserOptions> = {
  max_errors: 100,
  error_recovery: true,
};

/**
 * Mutable parser state shared across navigation + helper functions.
 *
 * - `tokens` — the immutable token stream from the lexer.
 * - `pos` — current cursor; mutated by `ps_advance`.
 * - `errors` — accumulated parser errors; mutated by `ps_add_error`.
 * - `options` — fully-resolved options (no partials) so callers can
 *   read `options.max_errors` / `options.error_recovery` without
 *   defaulting at every site.
 */
export interface ParserState {
  readonly tokens: readonly Token[];
  pos: number;
  errors: ParserError[];
  readonly options: Required<ParserOptions>;
}

/**
 * Construct a fresh ParserState. `options` may be partial — missing
 * fields are filled from `DEFAULT_PARSER_OPTIONS`. `pos` starts at 0
 * and `errors` starts as a fresh empty array.
 */
export function make_parser_state(tokens: readonly Token[], options: Partial<ParserOptions> = {}): ParserState {
  return {
    tokens,
    pos: 0,
    errors: [],
    options: { ...DEFAULT_PARSER_OPTIONS, ...options },
  };
}

// =============================================================================
// Token Navigation
// =============================================================================

/**
 * Token at the current cursor position. Falls back to the last token
 * (typically EOF) when the cursor has run past the end — matches the
 * pre-extraction `Parser.current()` behaviour.
 */
export function ps_current(s: ParserState): Token {
  return s.tokens[s.pos] ?? s.tokens[s.tokens.length - 1]!;
}

/**
 * Token immediately before the cursor. Clamped to index 0 so callers
 * at the start of the stream still get a defined token (the very
 * first token, typically the program-start token).
 */
export function ps_previous(s: ParserState): Token {
  return s.tokens[Math.max(0, s.pos - 1)]!;
}

/**
 * Advance the cursor by 1 (unless already at EOF) and return the
 * just-passed token. This mirrors the canonical recursive-descent
 * `advance()` shape: increment first, then return `previous()`.
 */
export function ps_advance(s: ParserState): Token {
  if (!ps_is_at_end(s)) {
    s.pos++;
  }
  return ps_previous(s);
}

/**
 * Whether the current token's type matches any of the supplied
 * types. Pure read; does not advance.
 */
export function ps_check(s: ParserState, ...types: TokenType[]): boolean {
  return types.includes(ps_current(s).type);
}

/**
 * If the current token matches any of the supplied types, advance
 * past it and return true. Otherwise leave the cursor where it is
 * and return false.
 */
export function ps_match(s: ParserState, ...types: TokenType[]): boolean {
  if (ps_check(s, ...types)) {
    ps_advance(s);
    return true;
  }
  return false;
}

/**
 * RISK #1 — Consume on type-match: advance and return the consumed
 * token. On mismatch, log an error via `ps_add_error` and return
 * `ps_current(s)` WITHOUT advancing. The cursor stalls so the caller
 * can decide on a recovery strategy (or let the outer loop handle
 * it). Pre-extraction parser depended on this no-advance shape; do
 * not change it.
 */
export function ps_consume(s: ParserState, type: TokenType, message: string): Token {
  if (ps_check(s, type)) {
    return ps_advance(s);
  }
  ps_add_error(s, message);
  return ps_current(s);
}

/**
 * Whether the cursor has reached the EOF token. Driven by token
 * type rather than index so a missing trailing EOF would be a
 * lexer bug, not a parser one.
 */
export function ps_is_at_end(s: ParserState): boolean {
  return ps_current(s).type === 'EOF';
}

/**
 * Append an error to `s.errors` whose `position` and `token` fields
 * are read from `ps_current(s)` at call time. Note: this does not
 * advance the cursor — pair with `ps_advance` at the caller if the
 * error should also consume the offending token.
 */
export function ps_add_error(s: ParserState, message: string): void {
  s.errors.push({
    message,
    position: ps_current(s).position,
    token: ps_current(s),
  });
}

/**
 * RISK #2 — Recovery: advance once, then keep advancing until either
 * (a) the current token is one of the statement-start keywords, or
 * (b) the previous token was RIGHT_BRACE (i.e. we just finished a
 * block). Both exit conditions are load-bearing: dropping (a) loses
 * sync at top-level statement boundaries; dropping (b) loses sync at
 * block-close boundaries. The leading unconditional advance is what
 * lets the loop make forward progress when the caller hits an error
 * AT a statement keyword (otherwise the keyword check would fire
 * immediately and the cursor would never move).
 */
export function ps_synchronize(s: ParserState): void {
  ps_advance(s);

  while (!ps_is_at_end(s)) {
    if (ps_check(s, 'RESOURCE', 'DATA', 'VARIABLE', 'OUTPUT', 'PROVIDER', 'MODULE', 'LOCALS', 'IMPORT')) {
      return;
    }

    if (ps_previous(s).type === 'RIGHT_BRACE') {
      return;
    }

    ps_advance(s);
  }
}
