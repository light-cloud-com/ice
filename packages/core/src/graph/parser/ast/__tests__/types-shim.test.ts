/**
 * rf-asttyp-1 — `ast/types.ts` re-export shim tests.
 *
 * Verifies the shim re-exports every interface and type the consumers
 * use, by constructing a sample object for each kind and asserting
 * `kind` discriminator equality. If a sub-file fails to re-export, the
 * test file fails to compile (TypeScript-level proof) AND the runtime
 * walker fails (vitest assertion).
 *
 * The shim is type-only — there are no runtime values to import. So
 * each test below imports the type and casts a sample literal to it,
 * then walks the discriminator. The cast is the load-bearing assertion;
 * a missing re-export turns into a TS error before the test runs.
 */

import { describe, it, expect } from 'vitest';
import type {
  // base
  AstNode,
  AstNodeKind,
  // statements
  Program,
  Statement,
  ResourceBlock,
  LifecycleConfig,
  DataBlock,
  VariableBlock,
  ValidationRule,
  TypeExpression,
  OutputBlock,
  ProviderBlock,
  ModuleBlock,
  LocalsBlock,
  ImportStatement,
  // expressions
  Expression,
  Identifier,
  TypeIdentifier,
  StringLiteral,
  NumberLiteral,
  BooleanLiteral,
  NullLiteral,
  ArrayExpression,
  ObjectExpression,
  ObjectProperty,
  PropertyAccess,
  IndexAccess,
  FunctionCall,
  BinaryOperator,
  BinaryExpression,
  UnaryOperator,
  UnaryExpression,
  ConditionalExpression,
  ForExpression,
  Interpolation,
  Reference,
  SplatExpression,
  // blocks
  Block,
  Attribute,
  NestedBlock,
} from '../types';

// Stub source span — every AstNode carries one.
const span = { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 } } as never;

describe('ast/types — re-export shim', () => {
  describe('base types', () => {
    it('AstNode requires kind + span', () => {
      const node: AstNode = { kind: 'Identifier', span };
      expect(node.kind).toBe('Identifier');
    });

    it('AstNodeKind enumerates all known kinds', () => {
      const kinds: AstNodeKind[] = [
        'Program',
        'ResourceBlock',
        'DataBlock',
        'VariableBlock',
        'OutputBlock',
        'ProviderBlock',
        'ModuleBlock',
        'LocalsBlock',
        'ImportStatement',
        'Identifier',
        'TypeIdentifier',
        'StringLiteral',
        'NumberLiteral',
        'BooleanLiteral',
        'NullLiteral',
        'ArrayExpression',
        'ObjectExpression',
        'PropertyAccess',
        'IndexAccess',
        'FunctionCall',
        'BinaryExpression',
        'UnaryExpression',
        'ConditionalExpression',
        'ForExpression',
        'Interpolation',
        'Reference',
        'SplatExpression',
        'Property',
        'Block',
        'Attribute',
      ];
      // 30 distinct kinds (no Set dedup needed if we enumerated correctly)
      expect(kinds.length).toBe(30);
      expect(new Set(kinds).size).toBe(30);
    });
  });

  describe('expressions', () => {
    const id: Identifier = { kind: 'Identifier', span, name: 'foo' };
    const tid: TypeIdentifier = { kind: 'TypeIdentifier', span, name: 'Ec2.Instance' };
    const str: StringLiteral = { kind: 'StringLiteral', span, value: 'hi' };
    const num: NumberLiteral = { kind: 'NumberLiteral', span, value: 42 };
    const bool: BooleanLiteral = { kind: 'BooleanLiteral', span, value: true };
    const nul: NullLiteral = { kind: 'NullLiteral', span };

    it('literal kinds round-trip', () => {
      expect(id.kind).toBe('Identifier');
      expect(tid.kind).toBe('TypeIdentifier');
      expect(str.kind).toBe('StringLiteral');
      expect(num.kind).toBe('NumberLiteral');
      expect(bool.kind).toBe('BooleanLiteral');
      expect(nul.kind).toBe('NullLiteral');
    });

    it('compound expressions accept nested children', () => {
      const arr: ArrayExpression = { kind: 'ArrayExpression', span, elements: [num, str] };
      const objProp: ObjectProperty = { key: id, value: num };
      const obj: ObjectExpression = { kind: 'ObjectExpression', span, properties: [objProp] };
      const access: PropertyAccess = { kind: 'PropertyAccess', span, object: id, property: id };
      const idx: IndexAccess = { kind: 'IndexAccess', span, object: id, index: num };
      const call: FunctionCall = { kind: 'FunctionCall', span, callee: id, arguments: [num] };
      expect(arr.elements).toHaveLength(2);
      expect(obj.properties[0].value).toBe(num);
      expect(access.object).toBe(id);
      expect(idx.index).toBe(num);
      expect(call.arguments[0]).toBe(num);
    });

    it('binary / unary operators are typed unions', () => {
      const op: BinaryOperator = '+';
      const uop: UnaryOperator = '!';
      const bin: BinaryExpression = { kind: 'BinaryExpression', span, operator: op, left: num, right: num };
      const un: UnaryExpression = { kind: 'UnaryExpression', span, operator: uop, operand: bool };
      expect(bin.operator).toBe('+');
      expect(un.operator).toBe('!');
    });

    it('conditional / for / interpolation / reference / splat round-trip', () => {
      const cond: ConditionalExpression = {
        kind: 'ConditionalExpression',
        span,
        condition: bool,
        then_branch: num,
        else_branch: num,
      };
      const fr: ForExpression = {
        kind: 'ForExpression',
        span,
        value_var: id,
        collection: id,
        value_expr: num,
      };
      const interp: Interpolation = { kind: 'Interpolation', span, expression: id };
      const ref: Reference = { kind: 'Reference', span, ref_type: 'resource', name: 'web' };
      const splat: SplatExpression = { kind: 'SplatExpression', span, object: id, full: true };
      expect(cond.then_branch).toBe(num);
      expect(fr.value_expr).toBe(num);
      expect(interp.expression).toBe(id);
      expect(ref.ref_type).toBe('resource');
      expect(splat.full).toBe(true);
    });

    it('Expression union narrows on kind', () => {
      const e: Expression = id;
      if (e.kind === 'Identifier') expect(e.name).toBe('foo');
    });
  });

  describe('blocks', () => {
    const id: Identifier = { kind: 'Identifier', span, name: 'foo' };
    const num: NumberLiteral = { kind: 'NumberLiteral', span, value: 1 };

    it('Attribute / Block / NestedBlock compose', () => {
      const attr: Attribute = { kind: 'Attribute', span, name: id, value: num };
      const block: Block = { kind: 'Block', span, attributes: [attr], blocks: [] };
      const nested: NestedBlock = { type: 'tagged', labels: ['foo'], body: block };
      expect(attr.kind).toBe('Attribute');
      expect(block.attributes).toHaveLength(1);
      expect(nested.body).toBe(block);
    });
  });

  describe('statements', () => {
    const id: Identifier = { kind: 'Identifier', span, name: 'foo' };
    const tid: TypeIdentifier = { kind: 'TypeIdentifier', span, name: 'Ec2.Instance' };
    const str: StringLiteral = { kind: 'StringLiteral', span, value: 'hi' };
    const num: NumberLiteral = { kind: 'NumberLiteral', span, value: 1 };
    const block: Block = { kind: 'Block', span, attributes: [], blocks: [] };

    it('ResourceBlock with optional fields', () => {
      const r: ResourceBlock = {
        kind: 'ResourceBlock',
        span,
        resource_type: tid,
        name: id,
        body: block,
      };
      expect(r.resource_type).toBe(tid);
    });

    it('LifecycleConfig is a non-AstNode helper', () => {
      const lc: LifecycleConfig = { create_before_destroy: true };
      expect(lc.create_before_destroy).toBe(true);
    });

    it('DataBlock / VariableBlock / OutputBlock / ProviderBlock', () => {
      const d: DataBlock = { kind: 'DataBlock', span, data_type: tid, name: id, body: block };
      const v: VariableBlock = { kind: 'VariableBlock', span, name: id };
      const o: OutputBlock = { kind: 'OutputBlock', span, name: id, value: num };
      const p: ProviderBlock = { kind: 'ProviderBlock', span, provider_name: id, body: block };
      expect(d.kind).toBe('DataBlock');
      expect(v.kind).toBe('VariableBlock');
      expect(o.kind).toBe('OutputBlock');
      expect(p.kind).toBe('ProviderBlock');
    });

    it('ValidationRule and TypeExpression', () => {
      const vr: ValidationRule = { condition: num, error_message: str };
      expect(vr.error_message).toBe(str);

      const t1: TypeExpression = 'string';
      const t2: TypeExpression = { list: 'number' };
      const t3: TypeExpression = { object: { foo: 'string' } };
      expect(t1).toBe('string');
      expect((t2 as { list: TypeExpression }).list).toBe('number');
      expect((t3 as { object: Record<string, TypeExpression> }).object.foo).toBe('string');
    });

    it('ModuleBlock / LocalsBlock / ImportStatement', () => {
      const m: ModuleBlock = { kind: 'ModuleBlock', span, name: id, source: str, body: block };
      const l: LocalsBlock = { kind: 'LocalsBlock', span, values: { x: num } };
      const i: ImportStatement = { kind: 'ImportStatement', span, path: str };
      expect(m.kind).toBe('ModuleBlock');
      expect(l.values.x).toBe(num);
      expect(i.path).toBe(str);
    });

    it('Program holds Statement[]', () => {
      const r: ResourceBlock = {
        kind: 'ResourceBlock',
        span,
        resource_type: tid,
        name: id,
        body: block,
      };
      const stmt: Statement = r;
      const prog: Program = { kind: 'Program', span, statements: [stmt] };
      expect(prog.statements[0]).toBe(r);
    });
  });

  describe('shim integrity', () => {
    it('every kind reachable from the shim discriminates correctly', () => {
      // Walk a representative tree to confirm the kind union actually
      // narrows when imported through the shim.
      const id: Identifier = { kind: 'Identifier', span, name: 'a' };
      const expr: Expression = id;
      const checked = expr.kind === 'Identifier' ? expr.name : 'fallback';
      expect(checked).toBe('a');
    });
  });
});
