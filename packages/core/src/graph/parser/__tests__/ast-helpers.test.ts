/**
 * Tests for the AST helpers `is_node_kind`, `create_span`, and
 * `visit_ast`. These helpers are part of the parser's public surface
 * (re-exported from `parser/index.ts`); the tests pin their behavior
 * across the rf-ast-1 split.
 *
 * `create_span` here is the 6-arg factory (line/column/offset triples
 * for start + end). The 2-arg parser-internal variant in
 * `parser-literals.ts` is a different function — see RISK #4 in
 * that module.
 */

import { describe, expect, it } from 'vitest';
import { create_span, is_node_kind, visit_ast } from '../ast/helpers';
import type {
  ArrayExpression,
  Attribute,
  BinaryExpression,
  Block,
  BooleanLiteral,
  ConditionalExpression,
  FunctionCall,
  Identifier,
  IndexAccess,
  NumberLiteral,
  ObjectExpression,
  Program,
  PropertyAccess,
  Reference,
  ResourceBlock,
  StringLiteral,
  TypeIdentifier,
  UnaryExpression,
} from '../ast/types';

const SPAN = create_span(1, 1, 0, 1, 1, 0);

const id = (name: string): Identifier => ({ kind: 'Identifier', name, span: SPAN });
const typeId = (name: string): TypeIdentifier => ({ kind: 'TypeIdentifier', name, span: SPAN });
const numLit = (value: number): NumberLiteral => ({ kind: 'NumberLiteral', value, span: SPAN });
const strLit = (value: string): StringLiteral => ({ kind: 'StringLiteral', value, span: SPAN });
const boolLit = (value: boolean): BooleanLiteral => ({ kind: 'BooleanLiteral', value, span: SPAN });

describe('create_span', () => {
  it('packs the 6-arg position triples into a SourceSpan with zero length', () => {
    const span = create_span(2, 4, 12, 5, 9, 42);
    expect(span.start).toEqual({ line: 2, column: 4, offset: 12, length: 0 });
    expect(span.end).toEqual({ line: 5, column: 9, offset: 42, length: 0 });
  });

  it('handles equal start/end (zero-width span)', () => {
    const span = create_span(1, 1, 0, 1, 1, 0);
    expect(span.start.line).toBe(1);
    expect(span.end.line).toBe(1);
    expect(span.start.offset).toBe(0);
    expect(span.end.offset).toBe(0);
  });
});

describe('is_node_kind', () => {
  it('returns true when the node kind matches', () => {
    const node = id('foo');
    expect(is_node_kind(node, 'Identifier')).toBe(true);
  });

  it('returns false when the node kind does not match', () => {
    const node = id('foo');
    expect(is_node_kind(node, 'NumberLiteral')).toBe(false);
  });

  it('narrows the type for downstream use (compile-time check)', () => {
    const node = numLit(7);
    if (is_node_kind(node, 'NumberLiteral')) {
      // TS narrowing — `value` must be a number here
      expect(node.value).toBe(7);
    } else {
      throw new Error('expected NumberLiteral narrowing');
    }
  });
});

describe('visit_ast — leaf nodes', () => {
  it('visits a leaf identifier exactly once and never recurses', () => {
    const visited: string[] = [];
    visit_ast(id('foo'), (n) => visited.push(n.kind));
    expect(visited).toEqual(['Identifier']);
  });

  it.each([
    ['Identifier', id('a')],
    ['TypeIdentifier', typeId('A')],
    ['StringLiteral', strLit('s')],
    ['NumberLiteral', numLit(1)],
    ['BooleanLiteral', boolLit(true)],
  ] as const)('visits the %s leaf exactly once', (kind, node) => {
    const visited: string[] = [];
    visit_ast(node, (n) => visited.push(n.kind));
    expect(visited).toEqual([kind]);
  });

  it('treats NullLiteral and Reference as leaves (no children)', () => {
    const nullNode = { kind: 'NullLiteral' as const, span: SPAN };
    const refNode: Reference = { kind: 'Reference', ref_type: 'var', name: 'v', span: SPAN };
    const visitedNull: string[] = [];
    const visitedRef: string[] = [];
    visit_ast(nullNode, (n) => visitedNull.push(n.kind));
    visit_ast(refNode, (n) => visitedRef.push(n.kind));
    expect(visitedNull).toEqual(['NullLiteral']);
    expect(visitedRef).toEqual(['Reference']);
  });
});

describe('visit_ast — composite nodes', () => {
  it('visits a Program then walks its statements', () => {
    const block: Block = { kind: 'Block', attributes: [], blocks: [], span: SPAN };
    const stmt: ResourceBlock = {
      kind: 'ResourceBlock',
      resource_type: typeId('Ec2.Instance'),
      name: id('main'),
      body: block,
      span: SPAN,
    };
    const program: Program = { kind: 'Program', statements: [stmt], span: SPAN };
    const visited: string[] = [];
    visit_ast(program, (n) => visited.push(n.kind));
    expect(visited).toEqual(['Program', 'ResourceBlock', 'TypeIdentifier', 'Identifier', 'Block']);
  });

  it('visits a ResourceBlock body subtree (resource_type, name, body)', () => {
    const block: Block = { kind: 'Block', attributes: [], blocks: [], span: SPAN };
    const node: ResourceBlock = {
      kind: 'ResourceBlock',
      resource_type: typeId('Ec2.Instance'),
      name: id('main'),
      body: block,
      span: SPAN,
    };
    const visited: string[] = [];
    visit_ast(node, (n) => visited.push(n.kind));
    expect(visited).toEqual(['ResourceBlock', 'TypeIdentifier', 'Identifier', 'Block']);
  });

  it('walks a Block.attributes list (each Attribute visits name + value)', () => {
    const attr: Attribute = {
      kind: 'Attribute',
      name: id('count'),
      value: numLit(3),
      span: SPAN,
    };
    const block: Block = { kind: 'Block', attributes: [attr], blocks: [], span: SPAN };
    const visited: string[] = [];
    visit_ast(block, (n) => visited.push(n.kind));
    expect(visited).toEqual(['Block', 'Attribute', 'Identifier', 'NumberLiteral']);
  });

  it('does NOT recurse into Block.blocks (NestedBlock has no `kind` field)', () => {
    const block: Block = {
      kind: 'Block',
      attributes: [],
      blocks: [{ type: 'lifecycle', labels: [], body: { kind: 'Block', attributes: [], blocks: [], span: SPAN } }],
      span: SPAN,
    };
    const visited: string[] = [];
    visit_ast(block, (n) => visited.push(n.kind));
    expect(visited).toEqual(['Block']);
  });

  it('visits BinaryExpression as left + right', () => {
    const node: BinaryExpression = {
      kind: 'BinaryExpression',
      operator: '+',
      left: numLit(1),
      right: numLit(2),
      span: SPAN,
    };
    const visited: string[] = [];
    visit_ast(node, (n) => visited.push(n.kind));
    expect(visited).toEqual(['BinaryExpression', 'NumberLiteral', 'NumberLiteral']);
  });

  it('visits UnaryExpression operand', () => {
    const node: UnaryExpression = {
      kind: 'UnaryExpression',
      operator: '!',
      operand: boolLit(true),
      span: SPAN,
    };
    const visited: string[] = [];
    visit_ast(node, (n) => visited.push(n.kind));
    expect(visited).toEqual(['UnaryExpression', 'BooleanLiteral']);
  });

  it('visits ArrayExpression elements in order', () => {
    const node: ArrayExpression = {
      kind: 'ArrayExpression',
      elements: [numLit(1), numLit(2), numLit(3)],
      span: SPAN,
    };
    const visited: string[] = [];
    visit_ast(node, (n) => visited.push(n.kind));
    expect(visited).toEqual(['ArrayExpression', 'NumberLiteral', 'NumberLiteral', 'NumberLiteral']);
  });

  it('visits ObjectExpression key + value for each property', () => {
    const node: ObjectExpression = {
      kind: 'ObjectExpression',
      properties: [
        { key: strLit('a'), value: numLit(1) },
        { key: strLit('b'), value: numLit(2) },
      ],
      span: SPAN,
    };
    const visited: string[] = [];
    visit_ast(node, (n) => visited.push(n.kind));
    expect(visited).toEqual(['ObjectExpression', 'StringLiteral', 'NumberLiteral', 'StringLiteral', 'NumberLiteral']);
  });

  it('visits PropertyAccess object + property', () => {
    const node: PropertyAccess = {
      kind: 'PropertyAccess',
      object: id('o'),
      property: id('p'),
      span: SPAN,
    };
    const visited: string[] = [];
    visit_ast(node, (n) => visited.push(n.kind));
    expect(visited).toEqual(['PropertyAccess', 'Identifier', 'Identifier']);
  });

  it('visits IndexAccess object + index', () => {
    const node: IndexAccess = {
      kind: 'IndexAccess',
      object: id('arr'),
      index: numLit(0),
      span: SPAN,
    };
    const visited: string[] = [];
    visit_ast(node, (n) => visited.push(n.kind));
    expect(visited).toEqual(['IndexAccess', 'Identifier', 'NumberLiteral']);
  });

  it('visits FunctionCall callee + args', () => {
    const node: FunctionCall = {
      kind: 'FunctionCall',
      callee: id('f'),
      arguments: [numLit(1), strLit('x')],
      span: SPAN,
    };
    const visited: string[] = [];
    visit_ast(node, (n) => visited.push(n.kind));
    expect(visited).toEqual(['FunctionCall', 'Identifier', 'NumberLiteral', 'StringLiteral']);
  });

  it('visits ConditionalExpression condition + then + else', () => {
    const node: ConditionalExpression = {
      kind: 'ConditionalExpression',
      condition: boolLit(true),
      then_branch: numLit(1),
      else_branch: numLit(2),
      span: SPAN,
    };
    const visited: string[] = [];
    visit_ast(node, (n) => visited.push(n.kind));
    expect(visited).toEqual(['ConditionalExpression', 'BooleanLiteral', 'NumberLiteral', 'NumberLiteral']);
  });

  it('falls through unknown kinds without traversing children (stable for non-handled kinds)', () => {
    const node = { kind: 'ForExpression', span: SPAN } as unknown as Parameters<typeof visit_ast>[0];
    const visited: string[] = [];
    visit_ast(node, (n) => visited.push(n.kind));
    expect(visited).toEqual(['ForExpression']);
  });
});
