/**
 * Parser Literals (rf-parse-2)
 *
 * Six standalone helpers extracted from the `Parser` class: identifier +
 * type-identifier parsing, string + boolean literal parsing, the null
 * literal constructor, and the parser-internal 2-arg `create_span`. All
 * functions are direct ports of the class-method bodies on `parser.ts`
 * pre-extraction (see `parser.ts` L922-L992 pre-extraction); `this.X(...)`
 * calls are rewritten to `ps_X(s, ...)` per the rf-parse-1 pattern.
 *
 * RISK #3 — `parse_type_identifier` silently accepts a trailing `.` when
 * the token after the dot is not an IDENTIFIER or TYPE_IDENTIFIER. The
 * `.` is already consumed by the time the inner check runs, so the dot
 * loop simply exits and the returned name carries a trailing `.`. No
 * error is added. The pre-extraction class method had this exact shape;
 * preserving it (rather than tightening to an error) keeps callers that
 * rely on the trailing-`.` recovery shape working.
 *
 * RISK #4 — `create_span` here is the parser-internal 2-arg variant that
 * just packages two `SourcePosition`s into a `SourceSpan`. It is NOT the
 * same function as `ast.ts::create_span`, which takes 6 numbers (start
 * line/col/offset + end line/col/offset) and constructs both positions
 * from primitives. Same name, different signatures, different purposes.
 * Do not merge them and do not import the AST one in this file.
 */
import type { SourcePosition, SourceSpan } from './tokens';
import {
  type ParserState,
  ps_advance,
  ps_check,
  ps_consume,
  ps_current,
  ps_match,
  ps_previous,
  ps_add_error,
} from './parser-state';
import type {
  BooleanLiteral,
  Identifier,
  NullLiteral,
  StringLiteral,
  TypeIdentifier,
} from './ast';

/**
 * Parse a single identifier token. Errors via `ps_consume` if the
 * current token is not IDENTIFIER; the consumed token's `value` is
 * used verbatim (no normalisation).
 */
export function parse_identifier(s: ParserState): Identifier {
  const token = ps_consume(s, 'IDENTIFIER', 'Expected identifier');
  return {
    kind: 'Identifier',
    name: token.value,
    span: create_span(token.position, token.position),
  };
}

/**
 * Parse a type identifier in any of the three accepted shapes:
 *
 *   - `TYPE_IDENTIFIER` token (e.g. `Ec2`) — used directly.
 *   - `IDENTIFIER` token, optionally followed by `.IDENTIFIER` /
 *     `.TYPE_IDENTIFIER` segments (e.g. `aws.Ec2.Instance`,
 *     `aws_instance`).
 *   - `STRING` token — `literal` (the unquoted contents) is used as
 *     the name.
 *
 * RISK #3 (silent dot-skip) is preserved: inside the `while
 * (ps_match(...))` dot loop, if the token following `.` is neither
 * IDENTIFIER nor TYPE_IDENTIFIER, the dot has already been consumed
 * by `ps_match`; the inner `if` simply skips, the outer `while`
 * re-checks for another `.` (typically false), and the loop exits
 * with a trailing `.` baked into `name`. No error is emitted.
 */
export function parse_type_identifier(s: ParserState): TypeIdentifier {
  let name = '';
  const start = ps_current(s).position;

  // Handle both "Ec2.Instance" and "aws_instance" style types
  if (ps_check(s, 'TYPE_IDENTIFIER')) {
    const token = ps_advance(s);
    name = token.value;
  } else if (ps_check(s, 'IDENTIFIER')) {
    name = ps_advance(s).value;
    while (ps_match(s, 'DOT')) {
      name += '.';
      if (ps_check(s, 'IDENTIFIER') || ps_check(s, 'TYPE_IDENTIFIER')) {
        name += ps_advance(s).value;
      }
    }
  } else if (ps_check(s, 'STRING')) {
    name = ps_advance(s).literal as string;
  } else {
    ps_add_error(s, 'Expected type identifier');
  }

  const end = ps_previous(s).position;

  return {
    kind: 'TypeIdentifier',
    name,
    span: create_span(start, end),
  };
}

/**
 * Parse a string literal. Errors via `ps_consume` if the current
 * token is not STRING; the consumed token's `literal` (the unquoted
 * contents from the lexer) is used as `value`.
 */
export function parse_string_literal(s: ParserState): StringLiteral {
  const token = ps_consume(s, 'STRING', 'Expected string');
  return {
    kind: 'StringLiteral',
    value: token.literal as string,
    span: create_span(token.position, token.position),
  };
}

/**
 * Parse a boolean literal if the current token is a BOOLEAN; otherwise
 * return `null` and leave the cursor untouched. Callers use the null
 * return to distinguish "explicit false" from "no boolean here" — see
 * the variable/output `sensitive` attribute parsing in parser.ts.
 */
export function parse_boolean_literal(s: ParserState): BooleanLiteral | null {
  if (ps_check(s, 'BOOLEAN')) {
    const token = ps_advance(s);
    return {
      kind: 'BooleanLiteral',
      value: token.literal as boolean,
      span: create_span(token.position, token.position),
    };
  }
  return null;
}

/**
 * Build a `NullLiteral` whose span is a zero-width region at `pos`.
 * Used for synthetic null values when the parser needs to fill in a
 * required slot after an error (see `parse_output_block`'s missing-
 * value recovery).
 */
export function create_null_literal(
  _s: ParserState,
  pos: SourcePosition,
): NullLiteral {
  return {
    kind: 'NullLiteral',
    span: create_span(pos, pos),
  };
}

/**
 * RISK #4 — Parser-internal `create_span`: packages two
 * `SourcePosition`s into a `SourceSpan`. This is a DIFFERENT function
 * from `ast.ts::create_span`, which takes 6 numbers (start line/col/
 * offset + end line/col/offset) and constructs both positions from
 * primitives. The two share a name but have distinct signatures and
 * use sites; do not merge and do not import the AST variant here.
 *
 * Pure: takes positions, not state.
 */
export function create_span(start: SourcePosition, end: SourcePosition): SourceSpan {
  return { start, end };
}
