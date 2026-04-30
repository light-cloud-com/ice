/**
 * Tests for `parser-block-body.ts` (rf-parse-5, landed atomically with rf-parse-6).
 *
 * Pins behaviour preserved from the pre-extraction `Parser` class
 * block-body methods. RISK #11 (zero-label nested-block path) is
 * pinned with its own test case:
 *
 *   RISK #11 — `parse_block` zero-label nested block: when the
 *              nested-block start is LEFT_BRACE (no labels), the
 *              outer disjunction admits LEFT_BRACE, the inner label
 *              loop's `STRING || IDENTIFIER` guard fails on the
 *              first iteration so `labels` stays `[]`, and the
 *              recursive `parse_block(s)` consumes the LEFT_BRACE
 *              itself. Both LEFT_BRACE in the outer condition AND
 *              the immediate-exit shape of the inner while are load-
 *              bearing.
 *
 * Tokens are constructed by hand — no lexer involvement — so each
 * test pins exactly the shape it cares about.
 */
import { describe, it, expect } from 'vitest';
import {
  parse_block,
  parse_data_block,
  parse_provider_block,
  parse_resource_block,
} from '../parser-block-body.js';
import { make_parser_state } from '../parser-state.js';
import type {
  Block,
  DataBlock,
  Identifier,
  NumberLiteral,
  ProviderBlock,
  ResourceBlock,
  StringLiteral,
  TypeIdentifier,
} from '../ast.js';
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

describe('parse_resource_block', () => {
  it('parses `resource <Type> <name> { }` and returns a ResourceBlock', () => {
    // resource Ec2 web {}
    const s = make_parser_state(
      eof(
        tk('RESOURCE', 'resource'),
        tk('TYPE_IDENTIFIER', 'Ec2'),
        id('web'),
        tk('LEFT_BRACE', '{'),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const node = parse_resource_block(s);
    expect(node.kind).toBe('ResourceBlock');
    expect(node.resource_type.name).toBe('Ec2');
    expect(node.name.name).toBe('web');
    expect(node.body.kind).toBe('Block');
    expect(node.body.attributes).toHaveLength(0);
    expect(node.body.blocks).toHaveLength(0);
  });

  it('captures attributes inside the body via parse_block recursion', () => {
    // resource Ec2 web { count = 3 }
    const s = make_parser_state(
      eof(
        tk('RESOURCE', 'resource'),
        tk('TYPE_IDENTIFIER', 'Ec2'),
        id('web'),
        tk('LEFT_BRACE', '{'),
        id('count'),
        tk('EQUALS', '='),
        num(3),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const node = parse_resource_block(s);
    expect(node.body.attributes).toHaveLength(1);
    const attr = node.body.attributes[0]!;
    expect(attr.name.name).toBe('count');
    expect((attr.value as NumberLiteral).value).toBe(3);
  });
});

describe('parse_data_block', () => {
  it('parses `data <Type> <name> { }` and returns a DataBlock', () => {
    // data Ami ubuntu {}
    const s = make_parser_state(
      eof(
        tk('DATA', 'data'),
        tk('TYPE_IDENTIFIER', 'Ami'),
        id('ubuntu'),
        tk('LEFT_BRACE', '{'),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const node = parse_data_block(s);
    expect(node.kind).toBe('DataBlock');
    expect(node.data_type.name).toBe('Ami');
    expect(node.name.name).toBe('ubuntu');
    expect(node.body.kind).toBe('Block');
  });
});

describe('parse_provider_block', () => {
  it('parses `provider <name> { }` and returns a ProviderBlock', () => {
    // provider aws {}
    const s = make_parser_state(
      eof(
        tk('PROVIDER', 'provider'),
        id('aws'),
        tk('LEFT_BRACE', '{'),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const node = parse_provider_block(s);
    expect(node.kind).toBe('ProviderBlock');
    expect(node.provider_name.name).toBe('aws');
    expect(node.body.kind).toBe('Block');
  });

  it('captures provider config attributes inside the body', () => {
    // provider aws { region = "us-east-1" }
    const s = make_parser_state(
      eof(
        tk('PROVIDER', 'provider'),
        id('aws'),
        tk('LEFT_BRACE', '{'),
        id('region'),
        tk('EQUALS', '='),
        str('us-east-1'),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const node = parse_provider_block(s);
    expect(node.body.attributes).toHaveLength(1);
    const attr = node.body.attributes[0]!;
    expect(attr.name.name).toBe('region');
    expect((attr.value as StringLiteral).value).toBe('us-east-1');
  });
});

describe('parse_block', () => {
  it('parses an empty `{ }` body', () => {
    const s = make_parser_state(eof(tk('LEFT_BRACE', '{'), tk('RIGHT_BRACE', '}')));
    const block = parse_block(s);
    expect(block.kind).toBe('Block');
    expect(block.attributes).toHaveLength(0);
    expect(block.blocks).toHaveLength(0);
  });

  it('parses a single attribute `{ name = "value" }`', () => {
    const s = make_parser_state(
      eof(
        tk('LEFT_BRACE', '{'),
        id('name'),
        tk('EQUALS', '='),
        str('value'),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const block = parse_block(s);
    expect(block.attributes).toHaveLength(1);
    const attr = block.attributes[0]!;
    expect(attr.kind).toBe('Attribute');
    expect(attr.name.name).toBe('name');
    expect((attr.value as StringLiteral).value).toBe('value');
  });

  it('parses multiple attributes', () => {
    const s = make_parser_state(
      eof(
        tk('LEFT_BRACE', '{'),
        id('a'),
        tk('EQUALS', '='),
        num(1),
        id('b'),
        tk('EQUALS', '='),
        num(2),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const block = parse_block(s);
    expect(block.attributes).toHaveLength(2);
    expect(block.attributes[0]!.name.name).toBe('a');
    expect(block.attributes[1]!.name.name).toBe('b');
  });

  it('parses a nested block with a STRING label', () => {
    // outer { inner "label-a" {} }
    const s = make_parser_state(
      eof(
        tk('LEFT_BRACE', '{'),
        id('inner'),
        str('label-a'),
        tk('LEFT_BRACE', '{'),
        tk('RIGHT_BRACE', '}'),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const block = parse_block(s);
    expect(block.blocks).toHaveLength(1);
    const nested = block.blocks[0]!;
    expect(nested.type).toBe('inner');
    expect(nested.labels).toEqual(['label-a']);
    expect(nested.body.kind).toBe('Block');
  });

  it('parses a nested block with an IDENTIFIER label', () => {
    // outer { inner foo {} }
    const s = make_parser_state(
      eof(
        tk('LEFT_BRACE', '{'),
        id('inner'),
        id('foo'),
        tk('LEFT_BRACE', '{'),
        tk('RIGHT_BRACE', '}'),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const block = parse_block(s);
    expect(block.blocks).toHaveLength(1);
    expect(block.blocks[0]!.labels).toEqual(['foo']);
  });

  it('parses a nested block with mixed STRING and IDENTIFIER labels', () => {
    // outer { inner "a" b "c" {} }
    const s = make_parser_state(
      eof(
        tk('LEFT_BRACE', '{'),
        id('inner'),
        str('a'),
        id('b'),
        str('c'),
        tk('LEFT_BRACE', '{'),
        tk('RIGHT_BRACE', '}'),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const block = parse_block(s);
    expect(block.blocks).toHaveLength(1);
    expect(block.blocks[0]!.labels).toEqual(['a', 'b', 'c']);
  });

  it(
    'RISK #11 — zero-label nested block: outer admits LEFT_BRACE, inner ' +
      'label loop exits immediately, labels stays []',
    () => {
      // outer { inner_block { } } — `inner_block` is the identifier; the
      // very next token is LEFT_BRACE (no STRING or IDENTIFIER labels in
      // between). The outer disjunction admits LEFT_BRACE; the inner
      // `while (STRING || IDENTIFIER)` exits without iterating; the
      // recursive parse_block then consumes the LEFT_BRACE.
      const s = make_parser_state(
        eof(
          tk('LEFT_BRACE', '{'),
          id('inner_block'),
          tk('LEFT_BRACE', '{'),
          tk('RIGHT_BRACE', '}'),
          tk('RIGHT_BRACE', '}'),
        ),
      );
      const block = parse_block(s);
      expect(block.blocks).toHaveLength(1);
      const nested = block.blocks[0]!;
      expect(nested.type).toBe('inner_block');
      expect(nested.labels).toEqual([]);
      expect(nested.body.kind).toBe('Block');
      expect(s.errors).toHaveLength(0);
    },
  );

  it('parses a recursive nested block (nested attribute inside nested body)', () => {
    // outer { inner "lbl" { x = 1 } }
    const s = make_parser_state(
      eof(
        tk('LEFT_BRACE', '{'),
        id('inner'),
        str('lbl'),
        tk('LEFT_BRACE', '{'),
        id('x'),
        tk('EQUALS', '='),
        num(1),
        tk('RIGHT_BRACE', '}'),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const block = parse_block(s);
    expect(block.blocks).toHaveLength(1);
    const inner_body = block.blocks[0]!.body;
    expect(inner_body.attributes).toHaveLength(1);
    expect(inner_body.attributes[0]!.name.name).toBe('x');
    expect((inner_body.attributes[0]!.value as NumberLiteral).value).toBe(1);
  });

  it('mixes attributes and nested blocks in the same body', () => {
    // outer { a = 1 nested "lbl" { } b = 2 }
    const s = make_parser_state(
      eof(
        tk('LEFT_BRACE', '{'),
        id('a'),
        tk('EQUALS', '='),
        num(1),
        id('nested'),
        str('lbl'),
        tk('LEFT_BRACE', '{'),
        tk('RIGHT_BRACE', '}'),
        id('b'),
        tk('EQUALS', '='),
        num(2),
        tk('RIGHT_BRACE', '}'),
      ),
    );
    const block = parse_block(s);
    expect(block.attributes).toHaveLength(2);
    expect(block.blocks).toHaveLength(1);
    expect(block.blocks[0]!.type).toBe('nested');
  });

  it(
    'unexpected token after identifier emits error and synchronises ' +
      'past the bad slice',
    () => {
      // outer { name + 1 }
      // After identifier `name`, neither EQUALS, LEFT_BRACE, STRING, nor
      // IDENTIFIER follows. Falls through to the error branch and calls
      // ps_synchronize. The synchronize advances past tokens until it
      // sees a statement keyword OR a previous RIGHT_BRACE — here, the
      // outer `}` ends up satisfying the previous-RIGHT_BRACE condition.
      const s = make_parser_state(
        eof(
          tk('LEFT_BRACE', '{'),
          id('name'),
          tk('PLUS', '+'),
          num(1),
          tk('RIGHT_BRACE', '}'),
        ),
      );
      parse_block(s);
      expect(s.errors.some((e) => e.message.includes("Unexpected token after identifier 'name'"))).toBe(true);
    },
  );
});
