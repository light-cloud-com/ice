/**
 * rf-vval-3 — Security validators tests.
 *
 * SensitiveDataValidator + BestPracticesValidator. Pure unit tests.
 */

import { describe, it, expect } from 'vitest';
import { create_mutable_graph } from '../../../mutable-graph';
import { SensitiveDataValidator, BestPracticesValidator } from '../security';

// ─── SensitiveDataValidator ──────────────────────────────────────────────────

describe('SensitiveDataValidator', () => {
  it('exposes name=sensitive', () => {
    expect(new SensitiveDataValidator().name).toBe('sensitive');
  });

  it('flags POTENTIAL_SENSITIVE_PROPERTY for a key matching /password/i', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: { password: 'plain' } });

    const issues = new SensitiveDataValidator().validate(graph);
    expect(issues.some((i) => i.code === 'POTENTIAL_SENSITIVE_PROPERTY' && i.path === 'password')).toBe(true);
  });

  it.each(['secret', 'api_key', 'apiKey', 'private_key', 'access_key', 'token', 'credential'])(
    'flags POTENTIAL_SENSITIVE_PROPERTY for key %s',
    (key) => {
      const graph = create_mutable_graph('test');
      graph.add_node({ type: 't', name: 'a', properties: { [key]: 'value' } });

      const issues = new SensitiveDataValidator().validate(graph);
      expect(issues.some((i) => i.code === 'POTENTIAL_SENSITIVE_PROPERTY')).toBe(true);
    },
  );

  it('does not flag plain non-sensitive keys', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: { name: 'foo', count: 3 } });

    const issues = new SensitiveDataValidator().validate(graph);
    expect(issues.some((i) => i.code === 'POTENTIAL_SENSITIVE_PROPERTY')).toBe(false);
  });

  it('flags POTENTIAL_HARDCODED_SECRET for base64-shaped values', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({
      type: 't',
      name: 'a',
      properties: { config_blob: 'YWFhYWFhYWFhYWFhYWFhYWFhYWE=' },
    });

    const issues = new SensitiveDataValidator().validate(graph);
    expect(issues.some((i) => i.code === 'POTENTIAL_HARDCODED_SECRET')).toBe(true);
  });

  it('flags POTENTIAL_HARDCODED_SECRET for hex strings', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({
      type: 't',
      name: 'a',
      properties: { hash_blob: 'a1b2c3d4e5f6abcdef0123456789abcd' }, // 32+ hex chars
    });

    const issues = new SensitiveDataValidator().validate(graph);
    expect(issues.some((i) => i.code === 'POTENTIAL_HARDCODED_SECRET')).toBe(true);
  });

  it('flags POTENTIAL_HARDCODED_SECRET for PEM headers', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({
      type: 't',
      name: 'a',
      properties: { pem_blob: '-----BEGIN PRIVATE KEY-----\nfoo\n-----END' },
    });

    const issues = new SensitiveDataValidator().validate(graph);
    expect(issues.some((i) => i.code === 'POTENTIAL_HARDCODED_SECRET')).toBe(true);
  });

  it('recurses into nested objects with dotted path prefix', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({
      type: 't',
      name: 'a',
      properties: { nested: { deeper: { secret: 'oops' } } },
    });

    const issues = new SensitiveDataValidator().validate(graph);
    const issue = issues.find((i) => i.code === 'POTENTIAL_SENSITIVE_PROPERTY');
    expect(issue).toBeDefined();
    expect(issue!.path).toBe('nested.deeper.secret');
  });

  it('does not recurse into arrays', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({
      type: 't',
      name: 'a',
      properties: { items: [{ password: 'in-array' }] },
    });

    const issues = new SensitiveDataValidator().validate(graph);
    // Arrays are skipped by the recursion, so the inner password is invisible.
    expect(issues.some((i) => i.path === 'items.password')).toBe(false);
  });

  it('does not recurse into null values', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({
      type: 't',
      name: 'a',
      properties: { maybe: null },
    });

    expect(() => new SensitiveDataValidator().validate(graph)).not.toThrow();
  });

  it('only flags one POTENTIAL_HARDCODED_SECRET per key (break after first match)', () => {
    const graph = create_mutable_graph('test');
    // Value matches multiple sensitive_value_patterns? Use a hex string
    // that's also long enough to be base64-shaped.
    graph.add_node({
      type: 't',
      name: 'a',
      properties: { blob: 'abcdef0123456789abcdef0123456789' }, // 32-char hex (also looks base64)
    });

    const issues = new SensitiveDataValidator().validate(graph);
    const matches = issues.filter((i) => i.code === 'POTENTIAL_HARDCODED_SECRET' && i.path === 'blob');
    expect(matches.length).toBe(1);
  });
});

// ─── BestPracticesValidator ──────────────────────────────────────────────────

describe('BestPracticesValidator', () => {
  it('exposes name=best-practices', () => {
    expect(new BestPracticesValidator().name).toBe('best-practices');
  });

  it('flags MISSING_TAGS when tags property is absent', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: {} });

    const issues = new BestPracticesValidator().validate(graph);
    expect(issues.some((i) => i.code === 'MISSING_TAGS')).toBe(true);
  });

  it('flags MISSING_TAGS when tags is undefined', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: { tags: undefined } });

    const issues = new BestPracticesValidator().validate(graph);
    expect(issues.some((i) => i.code === 'MISSING_TAGS')).toBe(true);
  });

  it('flags MISSING_TAGS when tags is null', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: { tags: null } });

    const issues = new BestPracticesValidator().validate(graph);
    expect(issues.some((i) => i.code === 'MISSING_TAGS')).toBe(true);
  });

  it('flags MISSING_TAGS when tags is an empty object', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: { tags: {} } });

    const issues = new BestPracticesValidator().validate(graph);
    expect(issues.some((i) => i.code === 'MISSING_TAGS')).toBe(true);
  });

  it('does not flag MISSING_TAGS when tags is a non-empty primitive (covers is_empty fallthrough)', () => {
    // is_empty's `return false` branch fires only for non-object,
    // non-null, non-undefined values. A string `tags` triggers it.
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: { tags: 'inline-string' as any } });

    const issues = new BestPracticesValidator().validate(graph);
    expect(issues.some((i) => i.code === 'MISSING_TAGS')).toBe(false);
  });

  it('does not flag MISSING_TAGS when tags has entries', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: { tags: { Env: 'prod' } } });

    const issues = new BestPracticesValidator().validate(graph);
    expect(issues.some((i) => i.code === 'MISSING_TAGS')).toBe(false);
  });

  it('flags MISSING_DESCRIPTION when metadata.annotations.description is absent', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: { tags: { x: 'y' } } });

    const issues = new BestPracticesValidator().validate(graph);
    expect(issues.some((i) => i.code === 'MISSING_DESCRIPTION')).toBe(true);
  });

  it('does not flag MISSING_DESCRIPTION when description is set on annotations', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: { tags: { x: 'y' } } });
    // Patch annotations.description directly on the node — add_node
    // doesn't accept metadata in its input shape.
    const node = Array.from(graph.nodes.values())[0];
    (node as any).metadata = {
      ...(node as any).metadata,
      annotations: { description: 'a thing' },
    };

    const issues = new BestPracticesValidator().validate(graph);
    expect(issues.some((i) => i.code === 'MISSING_DESCRIPTION')).toBe(false);
  });

  it('uses info severity for both findings', () => {
    const graph = create_mutable_graph('test');
    graph.add_node({ type: 't', name: 'a', properties: {} });

    const issues = new BestPracticesValidator().validate(graph);
    for (const i of issues) {
      expect(i.severity).toBe('info');
    }
  });
});
