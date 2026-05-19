/**
 * Tests for `parser-statements.ts` (rf-parse-6, landed atomically with rf-parse-5).
 *
 * Pins behaviour preserved from the pre-extraction `Parser` class
 * statement-level methods. Three blueprint risks are pinned with their
 * own test cases:
 *
 *   RISK #12 — Unknown-attribute `parse_expression(s)` discard. In the
 *              variable/output/module attribute-loop default branch,
 *              `parse_expression(s)` is called for its cursor-advancing
 *              side effect; the value is dropped. Removing the call
 *              causes an infinite loop on any block with an unknown
 *              attribute. Pinned by parsing a variable_block with an
 *              unknown attribute followed by a known one, and asserting
 *              the known attribute is still parsed.
 *
 *   RISK #13 — `parse_output_block` missing-value: BOTH a `ps_add_error`
 *              AND a synthetic `create_null_literal` are emitted. Pinned
 *              by parsing `output { description = "..." }` (no `value`)
 *              and asserting both an error AND a NullLiteral in the
 *              OutputBlock's `value` field.
 *
 *   RISK #14 — `parse_import_statement` silent token discard: a non-
 *              `as` identifier after the path is silently consumed and
 *              dropped. Pinned by parsing `import "foo" notas` and
 *              asserting (a) `alias` stays undefined, (b) no error is
 *              emitted, (c) the cursor advanced past `notas`.
 *
 * Tokens are constructed by hand — no lexer involvement — so each
 * test pins exactly the shape it cares about.
 */
import { describe, it, expect } from 'vitest';
import { make_parser_state } from '../parser-state';
import {
  parse_import_statement,
  parse_locals_block,
  parse_module_block,
  parse_output_block,
  parse_variable_block,
} from '../parser-statements';
import type { NullLiteral, NumberLiteral, StringLiteral } from '../ast';
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

/** Identifier-token shorthand. */
function id(name: string): Token {
  return tk('IDENTIFIER', name);
}

/** Number-literal token shorthand. */
function num(n: number): Token {
  return tk('NUMBER', String(n), n);
}

/** String-literal token shorthand. */
function str(value: string): Token {
  return tk('STRING', `"${value}"`, value);
}

/** Boolean-literal token shorthand. */
function bool(value: boolean): Token {
  return tk('BOOLEAN', String(value), value);
}

describe('parse_variable_block', () => {
  it('parses an empty variable block: `variable foo { }`', () => {
    const s = make_parser_state(
      eof(tk('VARIABLE', 'variable'), id('foo'), tk('LEFT_BRACE', '{'), tk('RIGHT_BRACE', '}')),
    );
    const node = parse_variable_block(s);
    expect(node.kind).toBe('VariableBlock');
    expect(node.name.name).toBe('foo');
    expect(node.description).toBeUndefined();
    expect(node.default_value).toBeUndefined();
    expect(node.sensitive).toBeUndefined();
  });

  it('captures `description`, `default`, and `sensitive` attributes', () => {
    // variable foo { description = "x" default = 7 sensitive = true }
    const s = make_parser_state(
      eof(
        tk('VARIABLE', 'variable'),
        id('foo'),
        tk('LEFT_BRACE', '{'),
        id('description'),
        tk('EQUALS', '='),
        str('x'),
        id('default'),
        tk('EQUALS', '='),
        num(7),
        id('sensitive'),
        tk('EQUALS', '='),
        bool(true),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const node = parse_variable_block(s);
    expect(node.description?.value).toBe('x');
    expect((node.default_value as NumberLiteral).value).toBe(7);
    expect(node.sensitive).toBe(true);
  });

  it(
    'RISK #12 — unknown attribute: cursor advances past unknown value via ' +
      'discarded parse_expression so the next valid attribute still parses',
    () => {
      // variable foo { unknown = 999 default = 7 }
      // Without the default-branch parse_expression call, the cursor
      // would stall at `999` and the outer while would loop forever. We
      // assert that `default = 7` still gets captured, which is only
      // possible if the discard advanced past `999`.
      const s = make_parser_state(
        eof(
          tk('VARIABLE', 'variable'),
          id('foo'),
          tk('LEFT_BRACE', '{'),
          id('unknown'),
          tk('EQUALS', '='),
          num(999),
          id('default'),
          tk('EQUALS', '='),
          num(7),
          tk('RIGHT_BRACE', '}'),
        ),
      );
      const node = parse_variable_block(s);
      // Unknown attr: dropped (no field to inspect), but the loop must
      // have moved past `999` for `default = 7` to be reached.
      expect((node.default_value as NumberLiteral).value).toBe(7);
    },
  );
});

describe('parse_output_block', () => {
  it('parses an output block with a value: `output foo { value = 1 }`', () => {
    const s = make_parser_state(
      eof(
        tk('OUTPUT', 'output'),
        id('foo'),
        tk('LEFT_BRACE', '{'),
        id('value'),
        tk('EQUALS', '='),
        num(1),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const node = parse_output_block(s);
    expect(node.kind).toBe('OutputBlock');
    expect(node.name.name).toBe('foo');
    expect((node.value as NumberLiteral).value).toBe(1);
    expect(s.errors).toHaveLength(0);
  });

  it('captures `description` and `sensitive` attributes', () => {
    const s = make_parser_state(
      eof(
        tk('OUTPUT', 'output'),
        id('foo'),
        tk('LEFT_BRACE', '{'),
        id('value'),
        tk('EQUALS', '='),
        num(1),
        id('description'),
        tk('EQUALS', '='),
        str('hi'),
        id('sensitive'),
        tk('EQUALS', '='),
        bool(true),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const node = parse_output_block(s);
    expect(node.description?.value).toBe('hi');
    expect(node.sensitive).toBe(true);
  });

  it(
    'unknown attribute (RISK #12 sibling): cursor advances past unknown ' +
      'value and the next valid attribute still parses',
    () => {
      // output foo { junk = 9 value = 1 }
      const s = make_parser_state(
        eof(
          tk('OUTPUT', 'output'),
          id('foo'),
          tk('LEFT_BRACE', '{'),
          id('junk'),
          tk('EQUALS', '='),
          num(9),
          id('value'),
          tk('EQUALS', '='),
          num(1),
          tk('RIGHT_BRACE', '}'),
        ),
      );
      const node = parse_output_block(s);
      expect((node.value as NumberLiteral).value).toBe(1);
    },
  );

  it('RISK #13 — missing `value`: BOTH error AND synthetic NullLiteral ' + 'are emitted', () => {
    // output foo { description = "x" }
    const s = make_parser_state(
      eof(
        tk('OUTPUT', 'output'),
        id('foo'),
        tk('LEFT_BRACE', '{'),
        id('description'),
        tk('EQUALS', '='),
        str('x'),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const node = parse_output_block(s);
    // Error MUST be emitted.
    expect(s.errors.some((e) => e.message === "Output block requires 'value' attribute")).toBe(true);
    // BUT the value field is filled with a synthetic NullLiteral, not
    // left undefined.
    expect(node.value.kind).toBe('NullLiteral');
    const nullLit = node.value as NullLiteral;
    // Span at the start of the block (zero-width region at `output`).
    expect(nullLit.span.start).toEqual(nullLit.span.end);
  });
});

describe('parse_module_block', () => {
  it('parses a module block with `source`: `module foo { source = "x" }`', () => {
    const s = make_parser_state(
      eof(
        tk('MODULE', 'module'),
        id('foo'),
        tk('LEFT_BRACE', '{'),
        id('source'),
        tk('EQUALS', '='),
        str('x'),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const node = parse_module_block(s);
    expect(node.kind).toBe('ModuleBlock');
    expect(node.name.name).toBe('foo');
    expect(node.source.value).toBe('x');
    expect(node.version).toBeUndefined();
    expect(node.body.attributes).toHaveLength(0);
    expect(node.body.blocks).toHaveLength(0);
    expect(s.errors).toHaveLength(0);
  });

  it('captures `version` and accumulates extra attributes into body.attributes', () => {
    // module foo { source = "x" version = "1.0" extra = 42 }
    const s = make_parser_state(
      eof(
        tk('MODULE', 'module'),
        id('foo'),
        tk('LEFT_BRACE', '{'),
        id('source'),
        tk('EQUALS', '='),
        str('x'),
        id('version'),
        tk('EQUALS', '='),
        str('1.0'),
        id('extra'),
        tk('EQUALS', '='),
        num(42),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const node = parse_module_block(s);
    expect(node.source.value).toBe('x');
    expect(node.version?.value).toBe('1.0');
    expect(node.body.attributes).toHaveLength(1);
    expect(node.body.attributes[0]!.name.name).toBe('extra');
    expect((node.body.attributes[0]!.value as NumberLiteral).value).toBe(42);
  });

  it('missing `source`: error emitted AND synthetic empty StringLiteral ' + 'fills the slot', () => {
    // module foo { version = "1.0" }
    const s = make_parser_state(
      eof(
        tk('MODULE', 'module'),
        id('foo'),
        tk('LEFT_BRACE', '{'),
        id('version'),
        tk('EQUALS', '='),
        str('1.0'),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const node = parse_module_block(s);
    expect(s.errors.some((e) => e.message === "Module block requires 'source' attribute")).toBe(true);
    expect(node.source.kind).toBe('StringLiteral');
    expect(node.source.value).toBe('');
  });
});

describe('parse_locals_block', () => {
  it('parses an empty locals block: `locals { }`', () => {
    const s = make_parser_state(eof(tk('LOCALS', 'locals'), tk('LEFT_BRACE', '{'), tk('RIGHT_BRACE', '}')));
    const node = parse_locals_block(s);
    expect(node.kind).toBe('LocalsBlock');
    expect(Object.keys(node.values)).toHaveLength(0);
  });

  it('parses multiple `name = value` entries into the values record', () => {
    // locals { a = 1 b = "x" }
    const s = make_parser_state(
      eof(
        tk('LOCALS', 'locals'),
        tk('LEFT_BRACE', '{'),
        id('a'),
        tk('EQUALS', '='),
        num(1),
        id('b'),
        tk('EQUALS', '='),
        str('x'),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const node = parse_locals_block(s);
    expect((node.values['a'] as NumberLiteral).value).toBe(1);
    expect((node.values['b'] as StringLiteral).value).toBe('x');
  });

  it('later definitions of the same name shadow earlier ones', () => {
    // locals { a = 1 a = 2 }
    const s = make_parser_state(
      eof(
        tk('LOCALS', 'locals'),
        tk('LEFT_BRACE', '{'),
        id('a'),
        tk('EQUALS', '='),
        num(1),
        id('a'),
        tk('EQUALS', '='),
        num(2),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const node = parse_locals_block(s);
    expect((node.values['a'] as NumberLiteral).value).toBe(2);
  });
});

describe('parse_import_statement', () => {
  it('parses a bare `import "<path>"` with no alias', () => {
    const s = make_parser_state(eof(tk('IMPORT', 'import'), str('foo')));
    const node = parse_import_statement(s);
    expect(node.kind).toBe('ImportStatement');
    expect(node.path.value).toBe('foo');
    expect(node.alias).toBeUndefined();
  });

  it('parses `import "<path>" as <alias>` with alias', () => {
    const s = make_parser_state(eof(tk('IMPORT', 'import'), str('foo'), id('as'), id('bar')));
    const node = parse_import_statement(s);
    expect(node.path.value).toBe('foo');
    expect(node.alias?.name).toBe('bar');
  });

  it('RISK #14 — non-`as` identifier silently consumed and dropped, no ' + 'alias set, no error emitted', () => {
    // import "foo" notas
    // `notas` is consumed by `ps_match(s, 'IDENTIFIER')` but the
    // subsequent `previous().value === 'as'` check fails, so the
    // identifier is silently dropped and `alias` stays undefined.
    const cursor_pos_before_notas = 2; // after IMPORT + STRING
    const s = make_parser_state(eof(tk('IMPORT', 'import'), str('foo'), id('notas')));
    const node = parse_import_statement(s);
    // Alias must NOT be set.
    expect(node.alias).toBeUndefined();
    // No error must be emitted.
    expect(s.errors).toHaveLength(0);
    // Cursor must have advanced past `notas` — pos should be the slot
    // AFTER the consumed identifier (3, the EOF index).
    expect(s.pos).toBeGreaterThan(cursor_pos_before_notas);
  });
});
