/**
 * Tests for `parser-primary.ts` (rf-parse-4, landed atomically with rf-parse-3).
 *
 * Pins behaviour preserved from the pre-extraction `Parser` class
 * primary-expression methods (parser.ts L698-L908 pre-extraction).
 * Three blueprint risks are pinned with their own test cases:
 *
 *   RISK #8 — `parse_primary` pre-advance token snapshot: every read
 *             inside the matched branches uses the `const token =
 *             ps_current(s)` snapshot taken BEFORE `ps_match`
 *             advances. If a future refactor reads `ps_current(s)`
 *             after the match, it would read the NEXT token.
 *
 *   RISK #9 — `parse_for_expression` map-comprehension identity:
 *             when FAT_ARROW is matched, `key_expr === value_expr`
 *             (same object reference). No second `parse_expression`
 *             after FAT_ARROW.
 *
 *   RISK #10 — `parse_reference` path: `path` is `undefined` (NOT
 *              `[]`) when there are no trailing dot-segments.
 *
 * Tokens are constructed by hand — no lexer involvement — so each
 * test pins exactly the shape it cares about.
 */
import { describe, it, expect } from 'vitest';
import {
  parse_primary,
  parse_array_expression,
  parse_object_expression,
  parse_for_expression,
  parse_reference,
} from '../parser-primary';
import { make_parser_state } from '../parser-state';
import type {
  ArrayExpression,
  BooleanLiteral,
  ForExpression,
  Identifier,
  NullLiteral,
  NumberLiteral,
  ObjectExpression,
  Reference,
  StringLiteral,
  TypeIdentifier,
} from '../ast';
import type { Token, TokenType, SourcePosition } from '../tokens';

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

/** Number-literal token shorthand. */
function num(n: number, position?: SourcePosition): Token {
  return tk('NUMBER', String(n), n, position);
}

/** Identifier-token shorthand. */
function id(name: string, position?: SourcePosition): Token {
  return tk('IDENTIFIER', name, undefined, position);
}

describe('parse_primary — literals', () => {
  it('matches STRING and reads `literal` (not `value`) for the result', () => {
    const s = make_parser_state(eof(tk('STRING', '"hello"', 'hello')));
    const expr = parse_primary(s) as StringLiteral;
    expect(expr.kind).toBe('StringLiteral');
    expect(expr.value).toBe('hello');
    expect(s.pos).toBe(1);
  });

  it('matches NUMBER and reads `literal` as a number', () => {
    const s = make_parser_state(eof(num(42)));
    const expr = parse_primary(s) as NumberLiteral;
    expect(expr.kind).toBe('NumberLiteral');
    expect(expr.value).toBe(42);
  });

  it('matches BOOLEAN with literal=true', () => {
    const s = make_parser_state(eof(tk('BOOLEAN', 'true', true)));
    const expr = parse_primary(s) as BooleanLiteral;
    expect(expr.kind).toBe('BooleanLiteral');
    expect(expr.value).toBe(true);
  });

  it('matches BOOLEAN with literal=false', () => {
    const s = make_parser_state(eof(tk('BOOLEAN', 'false', false)));
    const expr = parse_primary(s) as BooleanLiteral;
    expect(expr.value).toBe(false);
  });

  it('matches NULL', () => {
    const s = make_parser_state(eof(tk('NULL', 'null')));
    const expr = parse_primary(s) as NullLiteral;
    expect(expr.kind).toBe('NullLiteral');
  });

  it('matches TYPE_IDENTIFIER and uses `value` (not `literal`) as the name', () => {
    const s = make_parser_state(eof(tk('TYPE_IDENTIFIER', 'Ec2')));
    const expr = parse_primary(s) as TypeIdentifier;
    expect(expr.kind).toBe('TypeIdentifier');
    expect(expr.name).toBe('Ec2');
  });

  it('matches IDENTIFIER (non-reference) and returns Identifier', () => {
    const s = make_parser_state(eof(id('foo')));
    const expr = parse_primary(s) as Identifier;
    expect(expr.kind).toBe('Identifier');
    expect(expr.name).toBe('foo');
  });
});

describe('parse_primary — RISK #8 (pre-advance token snapshot)', () => {
  it('reads `token.literal` from the SNAPSHOT, not from ps_current after match', () => {
    // The literal value of the snapshot must end up on the AST node.
    // If the impl read `ps_current(s)` after `ps_match`, it would
    // see the EOF token and fail to extract the literal.
    const s = make_parser_state(eof(tk('NUMBER', '99', 99), id('next-token-should-not-be-read')));
    const expr = parse_primary(s) as NumberLiteral;
    expect(expr.value).toBe(99);
  });

  it('uses the SNAPSHOT position for the span (not the post-advance position)', () => {
    const pos: SourcePosition = { line: 7, column: 3, offset: 30, length: 1 };
    const s = make_parser_state(eof(num(42, pos), id('after')));
    const expr = parse_primary(s) as NumberLiteral;
    expect(expr.span.start).toEqual(pos);
    expect(expr.span.end).toEqual(pos);
  });

  it('reads `token.value` from the snapshot for IDENTIFIER, even after the ' + 'cursor advanced past it', () => {
    // The identifier-name read happens after `ps_match` advances.
    // If the impl read `ps_current(s).value`, it would see the EOF
    // value (empty string).
    const s = make_parser_state(eof(id('foo')));
    const expr = parse_primary(s) as Identifier;
    expect(expr.name).toBe('foo');
  });
});

describe('parse_primary — array/object/paren dispatch', () => {
  it('dispatches LEFT_BRACKET to parse_array_expression with the bracket position', () => {
    const startPos: SourcePosition = { line: 2, column: 1, offset: 10, length: 1 };
    const s = make_parser_state(
      eof(tk('LEFT_BRACKET', '[', undefined, startPos), num(1), tk('COMMA', ','), num(2), tk('RIGHT_BRACKET', ']')),
    );
    const expr = parse_primary(s) as ArrayExpression;
    expect(expr.kind).toBe('ArrayExpression');
    expect(expr.elements).toHaveLength(2);
    expect(expr.span.start).toEqual(startPos);
  });

  it('dispatches LEFT_BRACE to parse_object_expression', () => {
    const s = make_parser_state(
      eof(tk('LEFT_BRACE', '{'), id('key'), tk('EQUALS', '='), num(1), tk('RIGHT_BRACE', '}')),
    );
    const expr = parse_primary(s) as ObjectExpression;
    expect(expr.kind).toBe('ObjectExpression');
    expect(expr.properties).toHaveLength(1);
  });

  it('dispatches LEFT_PAREN to a parenthesised sub-expression', () => {
    const s = make_parser_state(eof(tk('LEFT_PAREN', '('), num(7), tk('PLUS', '+'), num(3), tk('RIGHT_PAREN', ')')));
    const expr = parse_primary(s);
    expect(expr.kind).toBe('BinaryExpression');
  });

  it('dispatches FOR to parse_for_expression', () => {
    const s = make_parser_state(
      eof(tk('FOR', 'for'), id('x'), tk('IN', 'in'), id('xs'), tk('COLON', ':'), id('x'), tk('RIGHT_BRACKET', ']')),
    );
    const expr = parse_primary(s) as ForExpression;
    expect(expr.kind).toBe('ForExpression');
  });
});

describe('parse_primary — IDENTIFIER reference dispatch', () => {
  it.each(['var', 'local', 'module', 'path', 'data'])('dispatches `%s` IDENTIFIER to parse_reference', (refType) => {
    // `<refType>.foo` should produce a Reference node.
    const tokens =
      refType === 'data'
        ? eof(id(refType), tk('DOT', '.'), id('aws_ami'), tk('DOT', '.'), id('foo'))
        : eof(id(refType), tk('DOT', '.'), id('foo'));
    const s = make_parser_state(tokens);
    const expr = parse_primary(s) as Reference;
    expect(expr.kind).toBe('Reference');
    expect(expr.ref_type).toBe(refType);
  });

  it('does NOT dispatch other identifiers (e.g. `foo`) to parse_reference', () => {
    const s = make_parser_state(eof(id('foo')));
    const expr = parse_primary(s);
    expect(expr.kind).toBe('Identifier');
  });
});

describe('parse_primary — error fallback', () => {
  it('emits an error and advances on an unmatched token, returns NullLiteral', () => {
    const s = make_parser_state(eof(tk('SEMICOLON', ';')));
    const expr = parse_primary(s) as NullLiteral;
    expect(expr.kind).toBe('NullLiteral');
    expect(s.errors).toHaveLength(1);
    expect(s.errors[0]?.message).toContain('Unexpected token');
    // Advanced past the offending token.
    expect(s.pos).toBe(1);
  });

  it('the NullLiteral span uses the snapshot position, not post-advance', () => {
    const pos: SourcePosition = { line: 4, column: 8, offset: 25, length: 1 };
    const s = make_parser_state(eof(tk('SEMICOLON', ';', undefined, pos)));
    const expr = parse_primary(s) as NullLiteral;
    expect(expr.span.start).toEqual(pos);
    expect(expr.span.end).toEqual(pos);
  });
});

describe('parse_array_expression', () => {
  it('parses an empty array `[]`', () => {
    const startPos: SourcePosition = { line: 1, column: 1, offset: 0, length: 1 };
    const s = make_parser_state(eof(tk('RIGHT_BRACKET', ']')));
    const expr = parse_array_expression(s, startPos);
    expect(expr.kind).toBe('ArrayExpression');
    expect(expr.elements).toHaveLength(0);
  });

  it('parses a single-element array `[1]`', () => {
    const s = make_parser_state(eof(num(1), tk('RIGHT_BRACKET', ']')));
    const expr = parse_array_expression(s, { line: 1, column: 1, offset: 0, length: 1 });
    expect(expr.elements).toHaveLength(1);
  });

  it('tolerates trailing comma `[1, 2,]` (parses as 2 elements)', () => {
    const s = make_parser_state(eof(num(1), tk('COMMA', ','), num(2), tk('COMMA', ','), tk('RIGHT_BRACKET', ']')));
    const expr = parse_array_expression(s, { line: 1, column: 1, offset: 0, length: 1 });
    expect(expr.elements).toHaveLength(2);
  });

  it('records an error if the closing `]` is missing', () => {
    const s = make_parser_state(eof(num(1)));
    parse_array_expression(s, { line: 1, column: 1, offset: 0, length: 1 });
    expect(s.errors.some((e) => e.message.includes("']'"))).toBe(true);
  });
});

describe('parse_object_expression', () => {
  it('parses an empty object `{}`', () => {
    const s = make_parser_state(eof(tk('RIGHT_BRACE', '}')));
    const expr = parse_object_expression(s, { line: 1, column: 1, offset: 0, length: 1 });
    expect(expr.kind).toBe('ObjectExpression');
    expect(expr.properties).toHaveLength(0);
  });

  it('parses an identifier-keyed object `{ foo = 1 }`', () => {
    const s = make_parser_state(eof(id('foo'), tk('EQUALS', '='), num(1), tk('RIGHT_BRACE', '}')));
    const expr = parse_object_expression(s, { line: 1, column: 1, offset: 0, length: 1 });
    expect(expr.properties).toHaveLength(1);
    const prop = expr.properties[0]!;
    expect(prop.computed).toBe(false);
    expect((prop.key as Identifier).name).toBe('foo');
    expect((prop.value as NumberLiteral).value).toBe(1);
  });

  it('parses a string-keyed object `{ "key" = 1 }`', () => {
    const s = make_parser_state(eof(tk('STRING', '"key"', 'key'), tk('EQUALS', '='), num(1), tk('RIGHT_BRACE', '}')));
    const expr = parse_object_expression(s, { line: 1, column: 1, offset: 0, length: 1 });
    const prop = expr.properties[0]!;
    expect((prop.key as StringLiteral).kind).toBe('StringLiteral');
    expect((prop.key as StringLiteral).value).toBe('key');
  });

  it('parses a computed-keyed object `{ (expr) = 1 }` with computed=true', () => {
    const s = make_parser_state(
      eof(tk('LEFT_PAREN', '('), id('expr'), tk('RIGHT_PAREN', ')'), tk('EQUALS', '='), num(1), tk('RIGHT_BRACE', '}')),
    );
    const expr = parse_object_expression(s, { line: 1, column: 1, offset: 0, length: 1 });
    const prop = expr.properties[0]!;
    expect(prop.computed).toBe(true);
    expect((prop.key as Identifier).name).toBe('expr');
  });

  it('parses multi-property objects', () => {
    const s = make_parser_state(
      eof(
        id('a'),
        tk('EQUALS', '='),
        num(1),
        tk('COMMA', ','),
        id('b'),
        tk('EQUALS', '='),
        num(2),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const expr = parse_object_expression(s, { line: 1, column: 1, offset: 0, length: 1 });
    expect(expr.properties).toHaveLength(2);
  });

  it('tolerates trailing comma', () => {
    const s = make_parser_state(eof(id('a'), tk('EQUALS', '='), num(1), tk('COMMA', ','), tk('RIGHT_BRACE', '}')));
    const expr = parse_object_expression(s, { line: 1, column: 1, offset: 0, length: 1 });
    expect(expr.properties).toHaveLength(1);
  });
});

describe('parse_for_expression — RISK #9 (key/value identity)', () => {
  it('parses a list comprehension `for x in xs : x` with single value var', () => {
    const s = make_parser_state(
      eof(id('x'), tk('IN', 'in'), id('xs'), tk('COLON', ':'), id('x'), tk('RIGHT_BRACKET', ']')),
    );
    const expr = parse_for_expression(s, { line: 1, column: 1, offset: 0, length: 1 });
    expect(expr.kind).toBe('ForExpression');
    expect(expr.key_var).toBeUndefined();
    expect(expr.value_var.name).toBe('x');
    expect((expr.collection as Identifier).name).toBe('xs');
    expect((expr.value_expr as Identifier).name).toBe('x');
    // No FAT_ARROW — key_expr should be undefined.
    expect(expr.key_expr).toBeUndefined();
  });

  it('parses a key,value comprehension `for k, v in m : v` with both vars', () => {
    const s = make_parser_state(
      eof(
        id('k'),
        tk('COMMA', ','),
        id('v'),
        tk('IN', 'in'),
        id('m'),
        tk('COLON', ':'),
        id('v'),
        tk('RIGHT_BRACKET', ']'),
      ),
    );
    const expr = parse_for_expression(s, { line: 1, column: 1, offset: 0, length: 1 });
    expect(expr.key_var?.name).toBe('k');
    expect(expr.value_var.name).toBe('v');
  });

  it(
    'RISK #9 — when FAT_ARROW is matched, `key_expr === value_expr` (same ' + 'object reference, NOT a re-parse)',
    () => {
      const s = make_parser_state(
        eof(
          id('k'),
          tk('COMMA', ','),
          id('v'),
          tk('IN', 'in'),
          id('m'),
          tk('COLON', ':'),
          id('v'),
          tk('FAT_ARROW', '=>'),
          tk('RIGHT_BRACKET', ']'),
        ),
      );
      const expr = parse_for_expression(s, { line: 1, column: 1, offset: 0, length: 1 });
      // Object identity check — must be the SAME reference.
      expect(expr.key_expr).toBe(expr.value_expr);
    },
  );

  it('parses an optional condition with `if`', () => {
    const s = make_parser_state(
      eof(
        id('x'),
        tk('IN', 'in'),
        id('xs'),
        tk('COLON', ':'),
        id('x'),
        tk('IF', 'if'),
        tk('BOOLEAN', 'true', true),
        tk('RIGHT_BRACKET', ']'),
      ),
    );
    const expr = parse_for_expression(s, { line: 1, column: 1, offset: 0, length: 1 });
    expect(expr.condition?.kind).toBe('BooleanLiteral');
  });

  it('records an error when the closing `]` is missing', () => {
    const s = make_parser_state(eof(id('x'), tk('IN', 'in'), id('xs'), tk('COLON', ':'), id('x')));
    parse_for_expression(s, { line: 1, column: 1, offset: 0, length: 1 });
    expect(s.errors.some((e) => e.message.includes("']'") || e.message.includes("'}'"))).toBe(true);
  });
});

describe('parse_reference — RISK #10 (path undefined vs [])', () => {
  it('parses `var.foo` with type_name=undefined and path=undefined', () => {
    const s = make_parser_state(eof(tk('DOT', '.'), id('foo')));
    const ref = parse_reference(s, { line: 1, column: 1, offset: 0, length: 3 }, 'var');
    expect(ref.kind).toBe('Reference');
    expect(ref.ref_type).toBe('var');
    expect(ref.name).toBe('foo');
    expect(ref.type_name).toBeUndefined();
    // RISK #10 — when no trailing dot-segments, path is undefined,
    // NOT [].
    expect(ref.path).toBeUndefined();
  });

  it('parses `local.foo.bar.baz` with path=["bar", "baz"]', () => {
    const s = make_parser_state(eof(tk('DOT', '.'), id('foo'), tk('DOT', '.'), id('bar'), tk('DOT', '.'), id('baz')));
    const ref = parse_reference(s, { line: 1, column: 1, offset: 0, length: 5 }, 'local');
    expect(ref.name).toBe('foo');
    expect(ref.path).toEqual(['bar', 'baz']);
  });

  it('parses `data.aws_ami.ubuntu` with type_name="aws_ami" and name="ubuntu"', () => {
    const s = make_parser_state(eof(tk('DOT', '.'), id('aws_ami'), tk('DOT', '.'), id('ubuntu')));
    const ref = parse_reference(s, { line: 1, column: 1, offset: 0, length: 4 }, 'data');
    expect(ref.ref_type).toBe('data');
    expect(ref.type_name).toBe('aws_ami');
    expect(ref.name).toBe('ubuntu');
    expect(ref.path).toBeUndefined();
  });

  it('parses `data.aws_ami.ubuntu.id` with path=["id"]', () => {
    const s = make_parser_state(
      eof(tk('DOT', '.'), id('aws_ami'), tk('DOT', '.'), id('ubuntu'), tk('DOT', '.'), id('id')),
    );
    const ref = parse_reference(s, { line: 1, column: 1, offset: 0, length: 4 }, 'data');
    expect(ref.type_name).toBe('aws_ami');
    expect(ref.name).toBe('ubuntu');
    expect(ref.path).toEqual(['id']);
  });

  it(
    'RISK #10 — empty trailing path is undefined, not []. Pin via type ' +
      'narrowing: ref.path must accept `undefined` here',
    () => {
      const s = make_parser_state(eof(tk('DOT', '.'), id('foo')));
      const ref = parse_reference(s, { line: 1, column: 1, offset: 0, length: 3 }, 'var');
      // The exact undefined check (not just falsy):
      expect(Object.prototype.hasOwnProperty.call(ref, 'path')).toBe(true);
      expect(ref.path).toBe(undefined);
      // If a regression set path = [], this would be false.
      expect(Array.isArray(ref.path)).toBe(false);
    },
  );

  it('emits an error when the leading DOT is missing', () => {
    const s = make_parser_state(eof(id('foo')));
    parse_reference(s, { line: 1, column: 1, offset: 0, length: 3 }, 'var');
    expect(s.errors.some((e) => e.message.includes("Expected '.'"))).toBe(true);
  });
});

describe('span tracking', () => {
  it('array span runs from the supplied start to the closing `]` position', () => {
    const startPos: SourcePosition = { line: 1, column: 1, offset: 0, length: 1 };
    const closePos: SourcePosition = { line: 1, column: 5, offset: 4, length: 1 };
    const s = make_parser_state(eof(num(1), tk('RIGHT_BRACKET', ']', undefined, closePos)));
    const expr = parse_array_expression(s, startPos);
    expect(expr.span.start).toEqual(startPos);
    expect(expr.span.end).toEqual(closePos);
  });

  it('object span runs from start to `}` position', () => {
    const startPos: SourcePosition = { line: 1, column: 1, offset: 0, length: 1 };
    const closePos: SourcePosition = { line: 1, column: 9, offset: 8, length: 1 };
    const s = make_parser_state(eof(id('a'), tk('EQUALS', '='), num(1), tk('RIGHT_BRACE', '}', undefined, closePos)));
    const expr = parse_object_expression(s, startPos);
    expect(expr.span.end).toEqual(closePos);
  });

  it('reference span runs from start to last identifier position', () => {
    const startPos: SourcePosition = { line: 1, column: 1, offset: 0, length: 3 };
    const lastPos: SourcePosition = { line: 1, column: 8, offset: 7, length: 3 };
    const s = make_parser_state(eof(tk('DOT', '.'), id('foo'), tk('DOT', '.'), id('bar', lastPos)));
    const ref = parse_reference(s, startPos, 'var');
    expect(ref.span.start).toEqual(startPos);
    expect(ref.span.end).toEqual(lastPos);
  });
});
