/**
 * Tests for `parser-literals.ts` (rf-parse-2).
 *
 * Pins behaviour preserved from the pre-extraction `Parser` class
 * literal-helper methods (parser.ts L922-L992 pre-extraction). Two
 * blueprint risks are pinned with their own test cases:
 *
 *   RISK #3 — `parse_type_identifier` silently accepts a trailing `.`
 *             when the token following the dot is neither IDENTIFIER
 *             nor TYPE_IDENTIFIER. The dot has already been consumed
 *             by the time the inner check runs; the loop simply exits
 *             with a trailing `.` baked into the name. No error.
 *
 *   RISK #4 — `create_span` here is the parser-internal 2-arg variant
 *             that takes two `SourcePosition`s. It is NOT the same as
 *             `ast.ts::create_span`, which takes 6 numbers (start
 *             line/col/offset + end line/col/offset). Same name,
 *             different signatures. The two must not be conflated.
 *
 * Tokens are constructed with hand-rolled positions (no lexer
 * involvement) so each test pins exactly the shape it cares about.
 * The `eof` helper appends a trailing EOF token so navigation
 * helpers have a sentinel to land on without depending on the lexer.
 */
import { describe, it, expect } from 'vitest';
import {
  parse_identifier,
  parse_type_identifier,
  parse_string_literal,
  parse_boolean_literal,
  create_null_literal,
  create_span,
} from '../parser-literals.js';
import { make_parser_state } from '../parser-state.js';
import type { Token, TokenType, SourcePosition } from '../tokens.js';

/** Build a minimal token at line/col 1 (with optional literal). */
function tk(
  type: TokenType,
  value = '',
  literal?: unknown,
  position: SourcePosition = { line: 1, column: 1, offset: 0, length: value.length },
): Token {
  return { type, value, literal, position };
}

/** Append an EOF sentinel — `ps_is_at_end` reads token type. */
function eof(...prefix: Token[]): Token[] {
  return [...prefix, tk('EOF')];
}

describe('parse_identifier', () => {
  it('matches an IDENTIFIER token and returns an Identifier with verbatim value', () => {
    const s = make_parser_state(eof(tk('IDENTIFIER', 'foo')));
    const ident = parse_identifier(s);
    expect(ident.kind).toBe('Identifier');
    expect(ident.name).toBe('foo');
    // Cursor advanced past the consumed token.
    expect(s.pos).toBe(1);
  });

  it('preserves the position on the span (start === end for a single token)', () => {
    const pos = { line: 4, column: 7, offset: 23, length: 3 };
    const s = make_parser_state(eof(tk('IDENTIFIER', 'bar', undefined, pos)));
    const ident = parse_identifier(s);
    expect(ident.span.start).toEqual(pos);
    expect(ident.span.end).toEqual(pos);
  });

  it('records an error when the current token is not IDENTIFIER (no advance)', () => {
    const s = make_parser_state(eof(tk('STRING', '"x"', 'x')));
    const ident = parse_identifier(s);
    // `ps_consume` mismatch path: error logged + cursor stalled.
    expect(s.errors).toHaveLength(1);
    expect(s.errors[0]?.message).toBe('Expected identifier');
    expect(s.pos).toBe(0);
    // Returned name is the un-consumed token's `value` (per RISK #1).
    expect(ident.name).toBe('"x"');
  });
});

describe('parse_type_identifier', () => {
  it('returns a TYPE_IDENTIFIER token directly', () => {
    const s = make_parser_state(eof(tk('TYPE_IDENTIFIER', 'Ec2')));
    const t = parse_type_identifier(s);
    expect(t.kind).toBe('TypeIdentifier');
    expect(t.name).toBe('Ec2');
    expect(s.pos).toBe(1);
  });

  it('concatenates IDENTIFIER + DOT + IDENTIFIER with a literal `.`', () => {
    const s = make_parser_state(
      eof(
        tk('IDENTIFIER', 'aws'),
        tk('DOT', '.'),
        tk('IDENTIFIER', 'instance'),
      ),
    );
    const t = parse_type_identifier(s);
    expect(t.name).toBe('aws.instance');
  });

  it('concatenates IDENTIFIER + DOT + TYPE_IDENTIFIER (mixed-case path)', () => {
    const s = make_parser_state(
      eof(
        tk('IDENTIFIER', 'aws'),
        tk('DOT', '.'),
        tk('TYPE_IDENTIFIER', 'Instance'),
      ),
    );
    const t = parse_type_identifier(s);
    expect(t.name).toBe('aws.Instance');
  });

  it('handles a multi-segment chain (a.b.c)', () => {
    const s = make_parser_state(
      eof(
        tk('IDENTIFIER', 'a'),
        tk('DOT', '.'),
        tk('IDENTIFIER', 'b'),
        tk('DOT', '.'),
        tk('IDENTIFIER', 'c'),
      ),
    );
    const t = parse_type_identifier(s);
    expect(t.name).toBe('a.b.c');
  });

  it(
    'RISK #3 — IDENTIFIER + DOT + STRING leaves a trailing `.` and does ' +
      'NOT add an error',
    () => {
      // The dot is consumed by `ps_match`; the inner check sees STRING
      // (not IDENTIFIER/TYPE_IDENTIFIER), the if simply skips, the
      // outer while re-checks for another DOT (false), and the loop
      // exits with `name === 'foo.'`.
      const s = make_parser_state(
        eof(
          tk('IDENTIFIER', 'foo'),
          tk('DOT', '.'),
          tk('STRING', '"x"', 'x'),
        ),
      );
      const t = parse_type_identifier(s);
      expect(t.name).toBe('foo.');
      expect(s.errors).toEqual([]);
      // Cursor is at the STRING token (DOT consumed, STRING not).
      expect(s.pos).toBe(2);
    },
  );

  it(
    'RISK #3 — IDENTIFIER + DOT + NUMBER also leaves a trailing `.` ' +
      'with no error (silent skip generalises beyond STRING)',
    () => {
      const s = make_parser_state(
        eof(
          tk('IDENTIFIER', 'foo'),
          tk('DOT', '.'),
          tk('NUMBER', '42', 42),
        ),
      );
      const t = parse_type_identifier(s);
      expect(t.name).toBe('foo.');
      expect(s.errors).toEqual([]);
    },
  );

  it('uses STRING `literal` (not `value`) for string-typed identifiers', () => {
    // Note: `value` would include the quotes; `literal` is the
    // unquoted contents the lexer parsed out.
    const s = make_parser_state(eof(tk('STRING', '"my-name"', 'my-name')));
    const t = parse_type_identifier(s);
    expect(t.name).toBe('my-name');
  });

  it('records an error when the current token is none of TYPE_IDENTIFIER/IDENTIFIER/STRING', () => {
    const s = make_parser_state(eof(tk('NUMBER', '1', 1)));
    const t = parse_type_identifier(s);
    expect(s.errors).toHaveLength(1);
    expect(s.errors[0]?.message).toBe('Expected type identifier');
    // Empty name on the error path.
    expect(t.name).toBe('');
  });
});

describe('parse_string_literal', () => {
  it('matches a STRING token and uses `literal` as the value', () => {
    const s = make_parser_state(eof(tk('STRING', '"hello"', 'hello')));
    const lit = parse_string_literal(s);
    expect(lit.kind).toBe('StringLiteral');
    expect(lit.value).toBe('hello');
    expect(s.pos).toBe(1);
  });

  it('records an error when the current token is not STRING', () => {
    const s = make_parser_state(eof(tk('NUMBER', '1', 1)));
    parse_string_literal(s);
    expect(s.errors).toHaveLength(1);
    expect(s.errors[0]?.message).toBe('Expected string');
    expect(s.pos).toBe(0); // RISK #1 — no advance on consume mismatch.
  });

  it('preserves the source position on the span', () => {
    const pos = { line: 9, column: 2, offset: 50, length: 7 };
    const s = make_parser_state(eof(tk('STRING', '"hello"', 'hello', pos)));
    const lit = parse_string_literal(s);
    expect(lit.span.start).toEqual(pos);
    expect(lit.span.end).toEqual(pos);
  });
});

describe('parse_boolean_literal', () => {
  it('returns BooleanLiteral { value: true } for a BOOLEAN token with literal=true', () => {
    const s = make_parser_state(eof(tk('BOOLEAN', 'true', true)));
    const lit = parse_boolean_literal(s);
    expect(lit).not.toBeNull();
    expect(lit?.kind).toBe('BooleanLiteral');
    expect(lit?.value).toBe(true);
    expect(s.pos).toBe(1);
  });

  it('returns BooleanLiteral { value: false } for a BOOLEAN token with literal=false', () => {
    const s = make_parser_state(eof(tk('BOOLEAN', 'false', false)));
    const lit = parse_boolean_literal(s);
    expect(lit).not.toBeNull();
    expect(lit?.value).toBe(false);
  });

  it('returns null and does not advance for a non-BOOLEAN token', () => {
    const s = make_parser_state(eof(tk('IDENTIFIER', 'x')));
    const lit = parse_boolean_literal(s);
    expect(lit).toBeNull();
    expect(s.pos).toBe(0);
    expect(s.errors).toEqual([]);
  });

  it('returns null and does not advance for a STRING token (sensitive=non-bool case)', () => {
    // The variable/output `sensitive` attribute parsing relies on the
    // null return to express "no boolean here" — mirror that.
    const s = make_parser_state(eof(tk('STRING', '"yes"', 'yes')));
    const lit = parse_boolean_literal(s);
    expect(lit).toBeNull();
  });
});

describe('create_null_literal', () => {
  it('returns a NullLiteral with a zero-width span at the supplied position', () => {
    const s = make_parser_state(eof(tk('IDENTIFIER', 'x')));
    const pos = { line: 3, column: 4, offset: 12, length: 0 };
    const nl = create_null_literal(s, pos);
    expect(nl.kind).toBe('NullLiteral');
    expect(nl.span.start).toEqual(pos);
    expect(nl.span.end).toEqual(pos);
  });

  it('does not advance the cursor (state is read-only here)', () => {
    const s = make_parser_state(eof(tk('IDENTIFIER', 'x')));
    create_null_literal(s, { line: 1, column: 1, offset: 0, length: 0 });
    expect(s.pos).toBe(0);
  });
});

describe('create_span', () => {
  it('packages two SourcePositions into a SourceSpan', () => {
    const start = { line: 1, column: 1, offset: 0, length: 0 };
    const end = { line: 5, column: 9, offset: 42, length: 0 };
    const span = create_span(start, end);
    expect(span.start).toBe(start);
    expect(span.end).toBe(end);
  });

  it('does NOT take state — pure function of two positions', () => {
    // Per RISK #4 the parser-internal `create_span` is the 2-arg
    // variant; this test pins that the function signature is exactly
    // (start, end) and not (state, start, end). If the signature
    // shifts, this test breaks at compile-time.
    const fn: (
      a: SourcePosition,
      b: SourcePosition,
    ) => { start: SourcePosition; end: SourcePosition } = create_span;
    const a = { line: 1, column: 1, offset: 0, length: 0 };
    const b = { line: 1, column: 2, offset: 1, length: 0 };
    expect(fn(a, b)).toEqual({ start: a, end: b });
  });

  it(
    'RISK #4 — this is the parser-internal 2-arg variant, distinct ' +
      'from `ast.ts::create_span` which takes 6 numbers',
    () => {
      // Sanity: invoking with 2 positions yields exactly { start, end }.
      // The ast.ts variant has signature (sl, sc, so, el, ec, eo) and
      // would not accept these inputs — TypeScript would flag the call
      // at compile time. This test fixes the parser-internal contract
      // so a future merge attempt regresses here visibly.
      const start = { line: 2, column: 3, offset: 5, length: 0 };
      const end = { line: 2, column: 8, offset: 10, length: 0 };
      expect(create_span(start, end)).toEqual({ start, end });
      // Function arity is exactly 2 (TS reports `length` as required-arg
      // count for non-rest fns).
      expect(create_span.length).toBe(2);
    },
  );
});
