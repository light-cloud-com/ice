/**
 * rf-vval-2 — Schema validators tests.
 *
 * TypeValidator + PropertyValidator. Both depend on a SchemaProvider —
 * we mock it with a small in-memory implementation.
 */

import { describe, it, expect, vi } from 'vitest';
import { create_mutable_graph } from '../../../mutable-graph.js';
import { TypeValidator, PropertyValidator } from '../schema.js';
import type { SchemaProvider, IceType } from '../../../../schema/schema-provider.js';

// ─── Mock schema provider ─────────────────────────────────────────────────────

interface PropDef {
  name: string;
  type: string;
  required?: boolean;
}

const mkProvider = (schemas: Record<string, PropDef[]>): SchemaProvider => ({
  has_schema: vi.fn((type: IceType) => Object.prototype.hasOwnProperty.call(schemas, type as string)),
  get_schema: vi.fn(async (type: IceType) => {
    if (Object.prototype.hasOwnProperty.call(schemas, type as string)) {
      return { ok: true, value: { properties: schemas[type as string] } } as any;
    }
    return { ok: false, error: 'unknown' } as any;
  }),
} as any);

// ─── TypeValidator ────────────────────────────────────────────────────────────

describe('TypeValidator', () => {
  it('exposes name=type', () => {
    const v = new TypeValidator();
    expect(v.name).toBe('type');
  });

  it('returns no issues when no schema provider is configured', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 'unknown.thing', name: 'a', properties: {} });

    const v = new TypeValidator();
    expect(v.validate(graph)).toEqual([]);
  });

  it('returns no issues when all node types are known', () => {
    const provider = mkProvider({ 'aws.ec2.vpc': [] });
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 'aws.ec2.vpc', name: 'a', properties: {} });

    const v = new TypeValidator(provider);
    expect(v.validate(graph)).toEqual([]);
  });

  it('flags UNKNOWN_TYPE for unrecognized types', () => {
    const provider = mkProvider({});
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 'unknown.thing', name: 'a', properties: {} });

    const v = new TypeValidator(provider);
    const issues = v.validate(graph);
    expect(issues.some((i) => i.code === 'UNKNOWN_TYPE')).toBe(true);
    const issue = issues[0];
    expect(issue.severity).toBe('error');
    expect(issue.message).toContain('Unknown resource type');
    expect(issue.suggestion).toContain('valid ICE resource type');
  });
});

// ─── PropertyValidator ────────────────────────────────────────────────────────

describe('PropertyValidator — synchronous fallback', () => {
  it('exposes name=property', () => {
    expect(new PropertyValidator().name).toBe('property');
  });

  it('flags INVALID_PROPERTIES when properties is not an object', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: {} });
    // Mutate to invalid shape directly.
    const node = Array.from(graph.nodes.values())[0];
    (node as any).properties = 'not-an-object';

    const issues = new PropertyValidator().validate(graph);
    expect(issues.some((i) => i.code === 'INVALID_PROPERTIES')).toBe(true);
  });

  it('flags INVALID_PROPERTIES when properties is an array', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: {} });
    const node = Array.from(graph.nodes.values())[0];
    (node as any).properties = [];

    const issues = new PropertyValidator().validate(graph);
    expect(issues.some((i) => i.code === 'INVALID_PROPERTIES')).toBe(true);
  });

  it('flags INVALID_PROPERTIES when properties is null', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: {} });
    const node = Array.from(graph.nodes.values())[0];
    (node as any).properties = null;

    const issues = new PropertyValidator().validate(graph);
    expect(issues.some((i) => i.code === 'INVALID_PROPERTIES')).toBe(true);
  });

  it('returns no issues when properties is a valid object', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: { x: 1 } });

    const issues = new PropertyValidator().validate(graph);
    expect(issues).toEqual([]);
  });
});

describe('PropertyValidator — async required-property check', () => {
  it('returns no issues without a schema provider', async () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: {} });

    const issues = await new PropertyValidator().validate_async(graph);
    expect(issues).toEqual([]);
  });

  it('flags MISSING_REQUIRED for required properties absent from the node', async () => {
    const provider = mkProvider({
      thing: [
        { name: 'cidr', type: 'string', required: true },
        { name: 'name', type: 'string', required: false },
      ],
    });
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 'thing', name: 'a', properties: {} });

    const issues = await new PropertyValidator(provider).validate_async(graph);
    expect(issues.some((i) => i.code === 'MISSING_REQUIRED')).toBe(true);
    const issue = issues.find((i) => i.code === 'MISSING_REQUIRED')!;
    expect(issue.path).toBe('cidr');
  });

  it('does not flag MISSING_REQUIRED when the property is present', async () => {
    const provider = mkProvider({
      thing: [{ name: 'cidr', type: 'string', required: true }],
    });
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 'thing', name: 'a', properties: { cidr: '10.0.0.0/16' } });

    const issues = await new PropertyValidator(provider).validate_async(graph);
    expect(issues.some((i) => i.code === 'MISSING_REQUIRED')).toBe(false);
  });

  it('skips nodes whose schema lookup fails (TypeValidator handles those)', async () => {
    const provider = mkProvider({}); // no schema for any type
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 'thing', name: 'a', properties: {} });

    const issues = await new PropertyValidator(provider).validate_async(graph);
    expect(issues).toEqual([]);
  });
});

describe('PropertyValidator — async unknown-property check', () => {
  it('flags UNKNOWN_PROPERTY for keys not in schema', async () => {
    const provider = mkProvider({
      thing: [{ name: 'known', type: 'string' }],
    });
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 'thing', name: 'a', properties: { known: 's', unknown: 'u' } });

    const issues = await new PropertyValidator(provider).validate_async(graph);
    expect(issues.some((i) => i.code === 'UNKNOWN_PROPERTY')).toBe(true);
  });
});

describe('PropertyValidator — async type-mismatch check', () => {
  const provider = mkProvider({
    thing: [
      { name: 'sname', type: 'string' },
      { name: 'snum', type: 'number' },
      { name: 'sbool', type: 'boolean' },
      { name: 'sarr', type: 'array' },
      { name: 'sobj', type: 'object' },
      { name: 'smap', type: 'map' },
    ],
  });

  it.each([
    ['sname', 123, 'string'],
    ['snum', 'oops', 'number'],
    ['sbool', 'true', 'boolean'],
    ['sarr', { not: 'array' }, 'array'],
    ['sobj', 'string', 'object'],
    ['smap', [], 'map'],
  ])('flags TYPE_MISMATCH for %s when value is wrong type', async (key, value, expected) => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 'thing', name: 'a', properties: { [key]: value } });

    const issues = await new PropertyValidator(provider).validate_async(graph);
    const mismatch = issues.find((i) => i.code === 'TYPE_MISMATCH' && i.path === key);
    expect(mismatch).toBeDefined();
    expect(mismatch!.message).toContain(`Expected ${expected.replace('map', 'object')}`);
  });

  it('does not flag valid string', async () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 'thing', name: 'a', properties: { sname: 'ok' } });

    const issues = await new PropertyValidator(provider).validate_async(graph);
    expect(issues.some((i) => i.code === 'TYPE_MISMATCH')).toBe(false);
  });

  it('does not flag valid number', async () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 'thing', name: 'a', properties: { snum: 42 } });

    const issues = await new PropertyValidator(provider).validate_async(graph);
    expect(issues.some((i) => i.code === 'TYPE_MISMATCH')).toBe(false);
  });

  it('does not flag valid boolean', async () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 'thing', name: 'a', properties: { sbool: true } });

    const issues = await new PropertyValidator(provider).validate_async(graph);
    expect(issues.some((i) => i.code === 'TYPE_MISMATCH')).toBe(false);
  });

  it('does not flag valid array', async () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 'thing', name: 'a', properties: { sarr: [1, 2] } });

    const issues = await new PropertyValidator(provider).validate_async(graph);
    expect(issues.some((i) => i.code === 'TYPE_MISMATCH')).toBe(false);
  });

  it('does not flag valid object', async () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 'thing', name: 'a', properties: { sobj: { k: 'v' } } });

    const issues = await new PropertyValidator(provider).validate_async(graph);
    expect(issues.some((i) => i.code === 'TYPE_MISMATCH')).toBe(false);
  });

  it('flags object-type for null value', async () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 'thing', name: 'a', properties: { sobj: null as any } });

    const issues = await new PropertyValidator(provider).validate_async(graph);
    expect(issues.some((i) => i.code === 'TYPE_MISMATCH' && i.path === 'sobj')).toBe(true);
  });
});
