/**
 * rf-canv-1 — type-shape regression for the canvas type leaf.
 *
 * `CanvasNode`, `ViewState`, and `CanvasConnection` were extracted from
 * `svg-canvas.tsx` into `./types.ts`. The orchestrator file re-exports them
 * via `export type { ... } from './types';` so 11+ existing consumers that
 * import these names from `'./svg-canvas'` (or `'../svg-canvas'`) continue
 * to resolve unchanged.
 *
 * These tests do two things:
 *   1. Import-resolution smoke: each of the three types must be importable
 *      from BOTH the canonical `'../types'` path AND the `'../svg-canvas'`
 *      re-export path. If either path silently breaks, this file fails to
 *      compile.
 *   2. Field-shape regression: assemble dummy values that exercise every
 *      required field and the optional fields. If a future edit drops or
 *      renames a field on any of the three interfaces, the corresponding
 *      assignment becomes a TS error here, surfacing the contract drift
 *      before consumer files break.
 */

import { describe, it, expect } from 'vitest';

// Canonical path
import type {
  CanvasNode as CanvasNodeCanonical,
  ViewState as ViewStateCanonical,
  CanvasConnection as CanvasConnectionCanonical,
} from '../types';

// Re-export shim path (same names, different module specifier)
import type {
  CanvasNode as CanvasNodeShim,
  ViewState as ViewStateShim,
  CanvasConnection as CanvasConnectionShim,
} from '../svg-canvas';

describe('canvas types — import resolution', () => {
  it('CanvasNode resolves from both ../types and ../svg-canvas', () => {
    const fromCanonical: CanvasNodeCanonical = {
      id: 'n1',
      type: 'block',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      label: 'sample',
      data: {},
    };
    const fromShim: CanvasNodeShim = fromCanonical;
    expect(fromShim.id).toBe('n1');
  });

  it('ViewState resolves from both ../types and ../svg-canvas', () => {
    const fromCanonical: ViewStateCanonical = { scale: 1, panX: 0, panY: 0 };
    const fromShim: ViewStateShim = fromCanonical;
    expect(fromShim.scale).toBe(1);
  });

  it('CanvasConnection resolves from both ../types and ../svg-canvas', () => {
    const fromCanonical: CanvasConnectionCanonical = { id: 'e1', from: 'a', to: 'b' };
    const fromShim: CanvasConnectionShim = fromCanonical;
    expect(fromShim.id).toBe('e1');
  });
});

describe('canvas types — field-shape regression', () => {
  it('CanvasNode keeps every required field plus optional parentId', () => {
    const sample: CanvasNodeCanonical = {
      id: 'node-1',
      type: 'block',
      x: 100,
      y: 200,
      width: 240,
      height: 80,
      label: 'My Service',
      data: { iceType: 'Compute.Container', custom: 42 },
      parentId: 'group-1',
    };
    expect(sample.id).toBe('node-1');
    expect(sample.type).toBe('block');
    expect(sample.x).toBe(100);
    expect(sample.y).toBe(200);
    expect(sample.width).toBe(240);
    expect(sample.height).toBe(80);
    expect(sample.label).toBe('My Service');
    expect(sample.data).toEqual({ iceType: 'Compute.Container', custom: 42 });
    expect(sample.parentId).toBe('group-1');
  });

  it('CanvasNode allows parentId to be null or omitted', () => {
    const withNull: CanvasNodeCanonical = {
      id: 'n1',
      type: 'resource',
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      label: '',
      data: {},
      parentId: null,
    };
    const omitted: CanvasNodeCanonical = {
      id: 'n2',
      type: 'container',
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      label: '',
      data: {},
    };
    expect(withNull.parentId).toBeNull();
    expect(omitted.parentId).toBeUndefined();
  });

  it('CanvasNode.type accepts each documented variant', () => {
    const block: CanvasNodeCanonical['type'] = 'block';
    const resource: CanvasNodeCanonical['type'] = 'resource';
    const container: CanvasNodeCanonical['type'] = 'container';
    expect([block, resource, container]).toEqual(['block', 'resource', 'container']);
  });

  it('ViewState keeps scale / panX / panY required fields', () => {
    const sample: ViewStateCanonical = { scale: 1.5, panX: -42, panY: 128 };
    expect(sample.scale).toBe(1.5);
    expect(sample.panX).toBe(-42);
    expect(sample.panY).toBe(128);
  });

  it('CanvasConnection keeps id / from / to and the optional type + data', () => {
    const minimal: CanvasConnectionCanonical = { id: 'e1', from: 'a', to: 'b' };
    expect(minimal.id).toBe('e1');
    expect(minimal.from).toBe('a');
    expect(minimal.to).toBe('b');
    expect(minimal.type).toBeUndefined();
    expect(minimal.data).toBeUndefined();

    const full: CanvasConnectionCanonical = {
      id: 'e2',
      from: 'svc',
      to: 'db',
      type: 'default',
      data: { relationship: 'reads-from', extra: true },
    };
    expect(full.type).toBe('default');
    expect(full.data?.relationship).toBe('reads-from');
    expect(full.data?.extra).toBe(true);
  });

  it('CanvasConnection.type accepts default and contains', () => {
    const defaultEdge: CanvasConnectionCanonical['type'] = 'default';
    const containsEdge: CanvasConnectionCanonical['type'] = 'contains';
    expect([defaultEdge, containsEdge]).toEqual(['default', 'contains']);
  });

  it('CanvasConnection.data carries arbitrary keys alongside relationship', () => {
    const sample: CanvasConnectionCanonical = {
      id: 'e3',
      from: 'a',
      to: 'b',
      data: { relationship: 'depends-on', weight: 3, label: 'edge label' },
    };
    expect(sample.data?.relationship).toBe('depends-on');
    expect(sample.data?.weight).toBe(3);
    expect(sample.data?.label).toBe('edge label');
  });
});
