/**
 * Unit tests for the rf-sched-5 on_progress wrapper.
 *
 * The wrapper is pure — it returns a new DeployOptions object whose
 * on_progress fans `step` events into both the original on_progress
 * AND on_node_progress (if wired). Tests just call the resulting
 * function and assert what shows up in the captured arrays.
 */

import { describe, it, expect } from 'vitest';
import { wrap_on_progress_for_node_progress } from '../progress-wrapper.js';
import type { ResourceChange } from '../../../diff/types.js';
import type { DeployOptions, NodeProgressEvent } from '../../types.js';

function build_change(name: string, type: string): ResourceChange {
  return {
    id: `${type}:${name}`,
    name,
    type,
    provider: 'gcp',
    change_type: 'create',
    property_changes: [],
    current_properties: null,
    desired_properties: {},
  };
}

describe('wrap_on_progress_for_node_progress', () => {
  it('returns the same object when neither callback is set', () => {
    const options = { provider: 'gcp' } as DeployOptions;
    const wrapped = wrap_on_progress_for_node_progress(options, new Map());
    expect(wrapped).toBe(options);
  });

  it('passes through every on_progress call to the original', () => {
    const observed: Array<[string, string, string]> = [];
    const options: DeployOptions = {
      provider: 'gcp',
      on_progress: (r, a, s) => observed.push([r, a, s]),
    } as DeployOptions;
    const wrapped = wrap_on_progress_for_node_progress(options, new Map());
    wrapped.on_progress!('r1', 'create', 'running');
    wrapped.on_progress!('r1', 'create', 'completed');
    expect(observed).toEqual([
      ['r1', 'create', 'running'],
      ['r1', 'create', 'completed'],
    ]);
  });

  it('forwards step events to on_node_progress with node_id from the change index', () => {
    const events: NodeProgressEvent[] = [];
    const change = build_change('a', 'gcp.run.service');
    const map = new Map([[change.name, change]]);
    const options: DeployOptions = {
      provider: 'gcp',
      on_node_progress: (e) => events.push(e),
    } as DeployOptions;
    const wrapped = wrap_on_progress_for_node_progress(options, map);
    wrapped.on_progress!('a', 'create', 'step', { step: { label: 'foo', index: 1, total: 3 } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      node_id: 'gcp.run.service:a',
      resource_name: 'a',
      step: { label: 'foo', index: 1, total: 3 },
    });
  });

  it('skips forwarding when status is not step', () => {
    const events: NodeProgressEvent[] = [];
    const change = build_change('a', 'gcp.run.service');
    const map = new Map([[change.name, change]]);
    const options: DeployOptions = {
      provider: 'gcp',
      on_node_progress: (e) => events.push(e),
    } as DeployOptions;
    const wrapped = wrap_on_progress_for_node_progress(options, map);
    wrapped.on_progress!('a', 'create', 'running');
    expect(events).toHaveLength(0);
  });

  it('skips forwarding when the resource is not in the change map', () => {
    const events: NodeProgressEvent[] = [];
    const options: DeployOptions = {
      provider: 'gcp',
      on_node_progress: (e) => events.push(e),
    } as DeployOptions;
    const wrapped = wrap_on_progress_for_node_progress(options, new Map());
    wrapped.on_progress!('zzz', 'create', 'step', { step: { label: 'foo', index: 1, total: 1 } });
    expect(events).toHaveLength(0);
  });

  it('still calls original on_progress even when on_node_progress throws', () => {
    const observed: string[] = [];
    const change = build_change('a', 'gcp.run.service');
    const options: DeployOptions = {
      provider: 'gcp',
      on_progress: (r) => observed.push(r),
      on_node_progress: () => {
        throw new Error('boom');
      },
    } as DeployOptions;
    const wrapped = wrap_on_progress_for_node_progress(options, new Map([[change.name, change]]));
    expect(() =>
      wrapped.on_progress!('a', 'create', 'step', { step: { label: 'x', index: 1, total: 1 } }),
    ).not.toThrow();
    expect(observed).toEqual(['a']);
  });
});
