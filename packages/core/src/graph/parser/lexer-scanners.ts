/**
 * Lexer Scanners (rf-lex-2)
 *
 * Simple scanners extracted from the `Lexer` class:
 *   - `scan_number`         — integer / decimal / exponent
 *   - `scan_identifier`     — identifier, keyword, or type identifier
 *   - `scan_line_comment`   — `// ...` and `# ...` comments
 *   - `scan_block_comment`  — `/* ... *\/` with nesting support
 *
 * Bodies are direct ports of the class methods on lexer.ts
 * pre-extraction (L351-L460); `this.X(...)` calls are rewritten to
 * `X(s, ...)` per the rf-lex-1 pattern. The 3 char predicates
 * (`is_digit`, `is_alpha`, `is_alphanumeric`) are module-private
 * because they are an implementation detail of these scanners.
 *
 * `scan_string` and `scan_heredoc` stay on lexer.ts in rf-lex-2 —
 * `scan_string` is small enough that extracting it now would create
 * a new file with one function (rf-lex-3 owns `scan_heredoc` because
 * its complexity warrants its own file).
 *
 * RISK #3 — `scan_number._negative` is unused but its signature is
 *           preserved. The leading `-` is consumed by the caller
 *           BEFORE dispatch (in `scan_token`'s `case '-':` branch);
 *           by the time `scan_number` runs the cursor is past the
 *           sign. The param is marked `_` to silence the linter
 *           without removing it; downstream callers (currently only
 *           `scan_token`) pass `true` here for documentation. Do
 *           not drop it — the rf-parse playbook's "preserve
 *           signature even when unused" rule applies.
 *
 * RISK #4 — 3-branch keyword dispatch in `scan_identifier`. The
 *           `keyword_type` switch handles TRUE / FALSE / NULL_KEYWORD
 *           specially (each emits a literal-bearing token: BOOLEAN
 *           true, BOOLEAN false, NULL null). Collapsing this to a
 *           single `add_token` call drops the literal payload and
 *           breaks downstream literal-resolution. Other keywords
 *           (RESOURCE, DATA, IF, etc.) fall through to the plain
 *           `add_token`.
 *
 * RISK #5 — TYPE_IDENTIFIER detection regex. The exact form is:
 *             `value.includes('.') || /^[A-Z]/.test(value)`
 *           Both branches are load-bearing. The dot branch catches
 *           qualified names (`gcp.Service`). The uppercase-start
 *           branch catches plain Type names (`Service`). Dropping
 *           either branch silently mis-classifies tokens — e.g.
 *           dropping `/^[A-Z]/.test(value)` reclassifies `Service`
 *           as IDENTIFIER, and `parser.parse_type` no longer fires.
 *
 * RISK #6 — Block-comment nested-depth counter. The slash-star
 *           increment and star-slash decrement are both load-bearing.
 *           Dropping the increment makes a doubly-nested comment end
 *           at the inner close (the trailing close becomes a
 *           SLASH+STAR pair). Dropping the decrement makes the
 *           comment never terminate (the lexer reports unterminated
 *           block comment).
 */
import { get_keyword_type } from './tokens.js';
import {
  type LexerState,
  ls_advance,
  ls_add_error,
  ls_add_token,
  ls_add_token_with_literal,
  ls_is_at_end,
  ls_peek,
  ls_peek_next,
} from './lexer-state.js';

// =============================================================================
// Char Predicates (module-private)
// =============================================================================

/** ASCII digit. */
function is_digit(char: string): boolean {
  return char >= '0' && char <= '9';
}

/** ASCII letter or underscore. */
function is_alpha(char: string): boolean {
  return (
    (char >= 'a' && char <= 'z') ||
    (char >= 'A' && char <= 'Z') ||
    char === '_'
  );
}

/** ASCII letter, digit, or underscore. */
function is_alphanumeric(char: string): boolean {
  return is_alpha(char) || is_digit(char);
}

// Re-export the predicates for the heredoc scanner (rf-lex-3) which
// reuses `is_alpha` and `is_digit` for delimiter parsing. Keeping
// them module-private to `lexer-scanners` would force `lexer-heredoc`
// to duplicate them, so we expose them as named exports without
// promoting them to the package's public API.
export { is_alpha, is_digit };

// =============================================================================
// Scanners
// =============================================================================

/**
 * Scan a number literal — integer, optional decimal, optional
 * exponent. The `_negative` parameter is unused (RISK #3): the
 * leading `-` is already consumed by the caller's dispatch before
 * `scan_number` runs.
 */
export function scan_number(
  s: LexerState,
  start_pos: number,
  start_line: number,
  start_column: number,
  _negative: boolean,
): void {
  // Integer part
  while (is_digit(ls_peek(s))) {
    ls_advance(s);
  }

  // Decimal part
  if (ls_peek(s) === '.' && is_digit(ls_peek_next(s))) {
    ls_advance(s); // consume '.'
    while (is_digit(ls_peek(s))) {
      ls_advance(s);
    }
  }

  // Exponent part
  if (ls_peek(s) === 'e' || ls_peek(s) === 'E') {
    ls_advance(s);
    if (ls_peek(s) === '+' || ls_peek(s) === '-') {
      ls_advance(s);
    }
    if (!is_digit(ls_peek(s))) {
      ls_add_error(s, 'Invalid number: expected exponent', true);
      return;
    }
    while (is_digit(ls_peek(s))) {
      ls_advance(s);
    }
  }

  const value = s.source.slice(start_pos, s.pos);
  const num = parseFloat(value);

  ls_add_token_with_literal(s, 'NUMBER', value, start_pos, start_line, start_column, num);
}

/**
 * Scan an identifier or keyword. RISK #4 / RISK #5 — preserve the
 * 3-branch keyword dispatch (TRUE / FALSE / NULL_KEYWORD emit
 * literal-bearing tokens) and the exact TYPE_IDENTIFIER detection
 * regex (`includes('.') || /^[A-Z]/`).
 */
export function scan_identifier(
  s: LexerState,
  start_pos: number,
  start_line: number,
  start_column: number,
): void {
  while (is_alphanumeric(ls_peek(s))) {
    ls_advance(s);
  }

  const value = s.source.slice(start_pos, s.pos);
  const keyword_type = get_keyword_type(value);

  if (keyword_type) {
    if (keyword_type === 'TRUE') {
      ls_add_token_with_literal(s, 'BOOLEAN', value, start_pos, start_line, start_column, true);
    } else if (keyword_type === 'FALSE') {
      ls_add_token_with_literal(s, 'BOOLEAN', value, start_pos, start_line, start_column, false);
    } else if (keyword_type === 'NULL_KEYWORD') {
      ls_add_token_with_literal(s, 'NULL', value, start_pos, start_line, start_column, null);
    } else {
      ls_add_token(s, keyword_type, value, start_pos, start_line, start_column);
    }
  } else {
    // Check if it looks like a type identifier (contains a dot or starts with uppercase)
    const is_type = value.includes('.') || /^[A-Z]/.test(value);
    ls_add_token(
      s,
      is_type ? 'TYPE_IDENTIFIER' : 'IDENTIFIER',
      value,
      start_pos,
      start_line,
      start_column,
    );
  }
}

/**
 * Scan a line comment (`// ...` or `# ...`) up to (but NOT including)
 * the next newline. Emits a COMMENT token only when
 * `options.include_comments` is true; otherwise the chars are simply
 * consumed and discarded.
 */
export function scan_line_comment(
  s: LexerState,
  start_pos: number,
  start_line: number,
  start_column: number,
): void {
  while (!ls_is_at_end(s) && ls_peek(s) !== '\n') {
    ls_advance(s);
  }

  if (s.options.include_comments) {
    const value = s.source.slice(start_pos, s.pos);
    ls_add_token(s, 'COMMENT', value, start_pos, start_line, start_column);
  }
}

/**
 * Scan a nested block comment (`/* ... *\/`). RISK #6 — the depth
 * counter increments on `/*` and decrements on `*\/`; both are
 * load-bearing. RISK #1 (from rf-lex-1) — the `column = 0` then
 * trailing `ls_advance` (column → 1) sequence on newlines is
 * preserved verbatim.
 */
export function scan_block_comment(
  s: LexerState,
  start_pos: number,
  start_line: number,
  start_column: number,
): void {
  let depth = 1;

  while (!ls_is_at_end(s) && depth > 0) {
    if (ls_peek(s) === '/' && ls_peek_next(s) === '*') {
      ls_advance(s);
      ls_advance(s);
      depth++;
    } else if (ls_peek(s) === '*' && ls_peek_next(s) === '/') {
      ls_advance(s);
      ls_advance(s);
      depth--;
    } else {
      if (ls_peek(s) === '\n') {
        s.line++;
        s.column = 0;
      }
      ls_advance(s);
    }
  }

  if (depth > 0) {
    ls_add_error(s, 'Unterminated block comment', true);
  }

  if (s.options.include_comments) {
    const value = s.source.slice(start_pos, s.pos);
    ls_add_token(s, 'COMMENT', value, start_pos, start_line, start_column);
  }
}
