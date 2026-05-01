/**
 * rf-ptree-1 — `encodeDrag` / `decodeDrag` round-trip helpers for the
 * project-tree drag-and-drop payload.
 *
 * Pure utility tests — no React, no Redux. Covers the encode shape, decode
 * happy path for both legal types, and every guard branch (no-colon
 * payload, unknown-type prefix, IDs containing colons).
 */

import { describe, it, expect } from 'vitest';
import { encodeDrag, decodeDrag, type DragItemType } from '../drag-encoding';

describe('encodeDrag', () => {
  it('formats a project payload as "project:<id>"', () => {
    expect(encodeDrag('project', 'abc-123')).toBe('project:abc-123');
  });

  it('formats a folder payload as "folder:<id>"', () => {
    expect(encodeDrag('folder', 'fid-456')).toBe('folder:fid-456');
  });

  it('does not escape colons in the id (round-trips with decodeDrag)', () => {
    const id = 'cluster:prod:0';
    const encoded = encodeDrag('folder', id);
    expect(encoded).toBe('folder:cluster:prod:0');
    expect(decodeDrag(encoded)).toEqual({ type: 'folder', id });
  });

  it('encodes the empty-string id without crashing', () => {
    expect(encodeDrag('project', '')).toBe('project:');
  });
});

describe('decodeDrag', () => {
  it('parses a project payload back into { type, id }', () => {
    expect(decodeDrag('project:abc-123')).toEqual({ type: 'project', id: 'abc-123' });
  });

  it('parses a folder payload back into { type, id }', () => {
    expect(decodeDrag('folder:fid-456')).toEqual({ type: 'folder', id: 'fid-456' });
  });

  it('returns null when the payload has no colon separator', () => {
    expect(decodeDrag('no-colon-here')).toBeNull();
  });

  it('returns null when the payload is empty', () => {
    expect(decodeDrag('')).toBeNull();
  });

  it('returns null when the type prefix is unknown', () => {
    expect(decodeDrag('environment:env-1')).toBeNull();
    expect(decodeDrag('garbage:abc')).toBeNull();
  });

  it('preserves an id that contains colons (split on the FIRST colon only)', () => {
    expect(decodeDrag('project:nested:id:value')).toEqual({
      type: 'project',
      id: 'nested:id:value',
    });
  });

  it('treats a leading colon as type=""→null (empty type rejected)', () => {
    expect(decodeDrag(':something')).toBeNull();
  });

  it('returns id="" when the payload is "<type>:" with empty id', () => {
    expect(decodeDrag('project:')).toEqual({ type: 'project', id: '' });
    expect(decodeDrag('folder:')).toEqual({ type: 'folder', id: '' });
  });
});

describe('round-trip', () => {
  it.each<[DragItemType, string]>([
    ['project', 'p1'],
    ['folder', 'f1'],
    ['project', '00000000-0000-0000-0000-000000000000'],
    ['folder', 'with:colons:inside'],
  ])('encode/decode preserves %s/%s', (type, id) => {
    const decoded = decodeDrag(encodeDrag(type, id));
    expect(decoded).toEqual({ type, id });
  });
});
