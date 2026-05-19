/**
 * rf-props-7 — use-resource-map / use-property-issues hooks.
 *
 * Tests run in a node-only vitest environment (no jsdom, no
 * @testing-library/react). The pure builders (`buildResourceMap`,
 * `buildPropertyIssuesMap`) carry the load-bearing branches — exercised
 * directly here for real coverage. The hooks themselves get a smoke test via
 * `renderToString`, which fires the synchronous `useState` initializer (and
 * the `useSelector` for `usePropertyIssues`) but NOT `useEffect` (no
 * server-side effects). That gap is intentional and documented per-test —
 * the API-resolved branch of `useResourceMap` is asserted via
 * `buildResourceMap` instead.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { describe, it, expect } from 'vitest';
import {
  buildResourceMap,
  buildPropertyIssuesMap,
  useResourceMap,
  usePropertyIssues,
  type ResourceDef,
  type ResourceCategory,
} from '../use-resource-map';

// ─── Fixture helpers ────────────────────────────────────────────────────────

const mkResource = (
  overrides: Partial<ResourceDef> & { ice_type: string } & { id?: string },
): ResourceDef =>
  ({
    ice_type: overrides.ice_type,
    display_name: overrides.display_name ?? 'Display',
    description: overrides.description ?? '',
    category: overrides.category ?? 'cat',
    icon: overrides.icon ?? '',
    behavior: overrides.behavior ?? '',
    providers: overrides.providers ?? [],
    implementations: overrides.implementations ?? [],
    properties: overrides.properties ?? [],
    ...(overrides.id !== undefined ? { id: overrides.id } : {}),
  }) as ResourceDef;

// ─── buildResourceMap ───────────────────────────────────────────────────────

describe('buildResourceMap', () => {
  it('returns an empty map for an empty array', () => {
    const result = buildResourceMap([]);
    expect(result.size).toBe(0);
  });

  it('keys flat ResourceDef[] entries by ice_type when no id is present', () => {
    const r = mkResource({ ice_type: 'compute_service' });
    const result = buildResourceMap([r]);
    expect(result.size).toBe(1);
    expect(result.get('compute_service')).toBe(r);
  });

  it('flattens nested ResourceCategory[] via cat.resources', () => {
    const compute = mkResource({ ice_type: 'compute_service' });
    const queue = mkResource({ ice_type: 'message_queue' });
    const data: ResourceCategory[] = [
      { category: 'Compute', categoryId: 'compute', resources: [compute] },
      { category: 'Messaging', categoryId: 'messaging', resources: [queue] },
    ];
    const result = buildResourceMap(data);
    expect(result.get('compute_service')).toBe(compute);
    expect(result.get('message_queue')).toBe(queue);
  });

  it('indexes a resource under both id and ice_type when they differ', () => {
    const r = mkResource({ ice_type: 'compute_service', id: 'compute-v2' });
    const result = buildResourceMap([r]);
    expect(result.size).toBe(2);
    expect(result.get('compute-v2')).toBe(r);
    expect(result.get('compute_service')).toBe(r);
  });

  it('indexes only once when id and ice_type are the same value', () => {
    const r = mkResource({ ice_type: 'compute_service', id: 'compute_service' });
    const result = buildResourceMap([r]);
    expect(result.size).toBe(1);
    expect(result.get('compute_service')).toBe(r);
  });

  it('skips a resource whose id falls back to a falsy ice_type', () => {
    // Both keys absent → nothing to index under
    const r = mkResource({ ice_type: '' });
    const result = buildResourceMap([r]);
    expect(result.size).toBe(0);
  });

  it('discriminates flat vs nested via the "resources" property on data[0]', () => {
    // A single-element array of `ResourceDef` (ice_type but no `resources` key)
    // must NOT be misread as a category list.
    const r = mkResource({ ice_type: 'compute_service' });
    const flat = buildResourceMap([r]);
    expect(flat.get('compute_service')).toBe(r);

    // A category list with a `resources` array on data[0] takes the nested branch.
    const nested = buildResourceMap([
      { category: 'C', categoryId: 'c', resources: [r] },
    ]);
    expect(nested.get('compute_service')).toBe(r);
  });
});

// ─── buildPropertyIssuesMap ─────────────────────────────────────────────────

describe('buildPropertyIssuesMap', () => {
  it('returns undefined when selectedNodeId is null', () => {
    expect(buildPropertyIssuesMap([], null)).toBeUndefined();
  });

  it('returns undefined when no issue matches the selected node', () => {
    const issues = [
      { nodeId: 'other', propertyPath: 'name', severity: 'error', message: 'msg' },
    ];
    expect(buildPropertyIssuesMap(issues, 'node-1')).toBeUndefined();
  });

  it('builds a map with one entry when one issue matches and has propertyPath', () => {
    const issues = [
      { nodeId: 'node-1', propertyPath: 'name', severity: 'error', message: 'required' },
    ];
    const result = buildPropertyIssuesMap(issues, 'node-1');
    expect(result?.size).toBe(1);
    expect(result?.get('name')).toEqual({ severity: 'error', message: 'required' });
  });

  it('skips matching issues that lack propertyPath', () => {
    const issues = [
      { nodeId: 'node-1', severity: 'warning', message: 'general issue' },
      { nodeId: 'node-1', propertyPath: 'port', severity: 'error', message: 'invalid' },
    ];
    const result = buildPropertyIssuesMap(issues, 'node-1');
    expect(result?.size).toBe(1);
    expect(result?.get('port')?.severity).toBe('error');
  });

  it('keeps the first issue when multiple share the same propertyPath', () => {
    const issues = [
      { nodeId: 'node-1', propertyPath: 'name', severity: 'error', message: 'first' },
      { nodeId: 'node-1', propertyPath: 'name', severity: 'warning', message: 'second' },
    ];
    const result = buildPropertyIssuesMap(issues, 'node-1');
    expect(result?.get('name')).toEqual({ severity: 'error', message: 'first' });
  });

  it('preserves multiple distinct propertyPaths', () => {
    const issues = [
      { nodeId: 'node-1', propertyPath: 'name', severity: 'error', message: 'a' },
      { nodeId: 'node-1', propertyPath: 'port', severity: 'warning', message: 'b' },
      { nodeId: 'node-1', propertyPath: 'memory', severity: 'info', message: 'c' },
    ];
    const result = buildPropertyIssuesMap(issues, 'node-1');
    expect(result?.size).toBe(3);
    expect(result?.get('name')?.message).toBe('a');
    expect(result?.get('port')?.message).toBe('b');
    expect(result?.get('memory')?.message).toBe('c');
  });

  it('ignores issues for other nodeIds', () => {
    const issues = [
      { nodeId: 'node-2', propertyPath: 'name', severity: 'error', message: 'other' },
      { nodeId: 'node-1', propertyPath: 'port', severity: 'warning', message: 'mine' },
    ];
    const result = buildPropertyIssuesMap(issues, 'node-1');
    expect(result?.size).toBe(1);
    expect(result?.get('port')?.message).toBe('mine');
    expect(result?.has('name')).toBe(false);
  });
});

// ─── Hook smoke tests via renderToString ─────────────────────────────────────
// `useEffect` does NOT run during renderToString, so these only exercise the
// synchronous initial-state path. The async API-resolved branch of
// `useResourceMap` is covered through `buildResourceMap` directly above.

const validationSlice = createSlice({
  name: 'validation',
  initialState: {
    issues: [] as Array<{
      nodeId?: string;
      propertyPath?: string;
      severity: string;
      message: string;
    }>,
  },
  reducers: {},
});

const makeStore = (
  issues: Array<{ nodeId?: string; propertyPath?: string; severity: string; message: string }>,
) =>
  configureStore({
    reducer: { validation: validationSlice.reducer },
    preloadedState: { validation: { issues } },
  });

describe('useResourceMap (smoke, renderToString)', () => {
  it('returns an empty Map on initial render and does not throw', () => {
    let captured: Map<string, ResourceDef> | undefined;
    const Probe: React.FC = () => {
      captured = useResourceMap();
      return <div>{String(captured.size)}</div>;
    };
    const html = renderToString(<Probe />);
    expect(html).toContain('0');
    expect(captured).toBeInstanceOf(Map);
    expect(captured?.size).toBe(0);
  });
});

describe('usePropertyIssues (smoke, renderToString)', () => {
  it('returns undefined on initial render with selectedNodeId === null', () => {
    let captured: ReturnType<typeof usePropertyIssues>;
    const Probe: React.FC = () => {
      captured = usePropertyIssues(null);
      return <div>{captured ? 'has' : 'undef'}</div>;
    };
    const html = renderToString(
      <Provider store={makeStore([])}>
        <Probe />
      </Provider>,
    );
    expect(html).toContain('undef');
    expect(captured).toBeUndefined();
  });

  it('reads validation issues from the redux store and returns a populated map for a matching node', () => {
    const store = makeStore([
      { nodeId: 'node-1', propertyPath: 'name', severity: 'error', message: 'required' },
      { nodeId: 'node-1', propertyPath: 'port', severity: 'warning', message: 'low' },
    ]);
    let captured: ReturnType<typeof usePropertyIssues>;
    const Probe: React.FC = () => {
      captured = usePropertyIssues('node-1');
      return <div>{String(captured?.size ?? 0)}</div>;
    };
    renderToString(
      <Provider store={store}>
        <Probe />
      </Provider>,
    );
    expect(captured?.size).toBe(2);
    expect(captured?.get('name')?.message).toBe('required');
  });
});
