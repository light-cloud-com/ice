/**
 * Lexer Heredoc Scanner (rf-lex-3) — HIGHEST-RISK UNIT
 *
 * Heredoc scanning extracted from the `Lexer` class. The body is a
 * direct port of the class method on lexer.ts pre-extraction
 * (L463-L541); `this.X(...)` calls are rewritten to `X(s, ...)` per
 * the rf-lex-1 pattern.
 *
 * `is_alpha` and `is_digit` are imported from `./lexer-scanners.js`
 * (rf-lex-2). The choice to expose them as named exports there
 * (instead of duplicating them here) keeps the predicate semantics
 * single-sourced; if either ever needs to change (e.g. allowing
 * Unicode letters), the change is in one place.
 *
 * Heredoc shape:
 *
 *   <<DELIM
 *   line 1
 *   line 2
 *   DELIM
 *
 * Or indented mode (leading whitespace stripped from terminator
 * line, content unchanged before trim):
 *
 *   <<-DELIM
 *     line 1
 *     line 2
 *     DELIM
 *
 * The token's `value` carries the raw `<<DELIM\n...DELIM` source
 * slice; the literal carries the parsed content with `.trimEnd()`
 * applied (RISK #8).
 *
 * RISK #7 — Terminator backtrack. When a candidate terminator line
 *           fails the indentation/match check, `s.pos` is reset to
 *           `check_start` (the position AFTER any leading whitespace
 *           consumed for indentation), NOT to `line_start` (the
 *           start of the line). The leading whitespace is permanently
 *           consumed and re-scanned as content on the failing-match
 *           path's "Read until end of line" loop. This is observable
 *           in the raw source slice but matches the pre-extraction
 *           behaviour exactly. Do not "fix" the backtrack to
 *           `line_start` — content offsets and column tracking depend
 *           on this.
 *
 * RISK #8 — `content_end = line_start` then `trimEnd()`. The boundary
 *           is set to the START of the terminator line BEFORE any
 *           leading-whitespace consumption, so `content` may include
 *           a trailing newline + leading whitespace from the line
 *           preceding the terminator. The `content.trimEnd()` call at
 *           the very end strips trailing whitespace in one shot. Do
 *           not reorder: setting `content_end` to `pos` after the
 *           delimiter loop would include the delimiter in the value.
 *
 * RISK #9 — EOF without a closing delimiter is SILENT. The outer
 *           `while (!ls_is_at_end(s))` loop exits cleanly; no
 *           `ls_add_error` is fired. This is a deliberate behavior
 *           (pre-extraction did not error here either). The token
 *           still emits — its value is whatever was consumed up to
 *           EOF, with `content_end` left at its initial value
 *           (`content_start`), so the literal is empty. Do not add
 *           an error here without coordinating with downstream
 *           consumers (that may rely on the silent shape).
 *
 * RISK #10 — Two newline accounting sites. Both the opening-line
 *            "skip to end of line" path (after delimiter parsing)
 *            and the content-loop "read until end of line" path
 *            execute `ls_advance(s)` then `s.line++; s.column = 1`.
 *            Dropping either bumps line numbering off by 1 in
 *            error messages and downstream AST positions. Both
 *            sites are load-bearing.
 */
import {
  type LexerState,
  ls_advance,
  ls_add_error,
  ls_add_token_with_literal,
  ls_is_at_end,
  ls_match,
  ls_peek,
} from './lexer-state';
import { is_alpha, is_digit } from './lexer-scanners';

/**
 * Scan a heredoc string. The caller (scan_token's `case '<':` branch)
 * has already consumed the leading `<<` by the time this runs, and
 * passes through the start_pos/start_line/start_column captured
 * before the first `<` was consumed.
 */
export function scan_heredoc(
  s: LexerState,
  start_pos: number,
  start_line: number,
  start_column: number,
): void {
  // Skip optional '-' for indented heredoc
  const indented = ls_match(s, '-');

  // Read delimiter identifier
  const delimiter_start = s.pos;
  while (is_alpha(ls_peek(s)) || is_digit(ls_peek(s)) || ls_peek(s) === '_') {
    ls_advance(s);
  }
  const delimiter = s.source.slice(delimiter_start, s.pos);

  if (delimiter.length === 0) {
    ls_add_error(s, 'Expected heredoc delimiter', true);
    return;
  }

  // Skip to end of line
  while (!ls_is_at_end(s) && ls_peek(s) !== '\n') {
    ls_advance(s);
  }
  // RISK #10 (site 1) — opening-line newline accounting.
  if (!ls_is_at_end(s)) {
    ls_advance(s); // consume newline
    s.line++;
    s.column = 1;
  }

  // Read content until we find the closing delimiter
  const content_start = s.pos;
  let content_end = s.pos;

  while (!ls_is_at_end(s)) {
    // Check for delimiter at start of line
    const line_start = s.pos;

    // Skip leading whitespace for indented heredocs
    if (indented) {
      while (ls_peek(s) === ' ' || ls_peek(s) === '\t') {
        ls_advance(s);
      }
    }

    // Check if this line is the delimiter
    let is_delimiter = true;
    const check_start = s.pos;
    for (let i = 0; i < delimiter.length; i++) {
      if (ls_peek(s) !== delimiter[i]) {
        is_delimiter = false;
        break;
      }
      ls_advance(s);
    }

    // Check for end of line or file after delimiter
    if (
      is_delimiter &&
      (ls_is_at_end(s) || ls_peek(s) === '\n' || ls_peek(s) === '\r')
    ) {
      // RISK #8 — content_end is line_start (start of terminator
      // line) BEFORE any whitespace was consumed. The trailing
      // .trimEnd() (below) strips the line-leading whitespace +
      // newline that remains.
      content_end = line_start;
      break;
    }

    // RISK #7 — Not the delimiter, reset to check_start (NOT
    // line_start). The leading whitespace consumed for indentation
    // is permanently gone; content offsets depend on this.
    s.pos = check_start;

    // Read until end of line
    while (!ls_is_at_end(s) && ls_peek(s) !== '\n') {
      ls_advance(s);
    }
    // RISK #10 (site 2) — content-loop newline accounting.
    if (!ls_is_at_end(s)) {
      ls_advance(s); // consume newline
      s.line++;
      s.column = 1;
    }
  }

  // RISK #9 — EOF reaches here with content_end still at content_start
  // (initial value), making the literal empty. No add_error. The
  // token still emits; downstream consumers see a STRING with an
  // empty literal — preserve verbatim.
  const content = s.source.slice(content_start, content_end);
  const raw = s.source.slice(start_pos, s.pos);

  ls_add_token_with_literal(
    s,
    'STRING',
    raw,
    start_pos,
    start_line,
    start_column,
    content.trimEnd(),
  );
}
