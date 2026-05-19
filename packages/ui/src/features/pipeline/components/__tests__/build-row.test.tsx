/**
 * rf-ppanel-4 — BuildRow.
 *
 * Direct-FC tests. The em-dash fallback uses `||` (not `??`), which means
 * an empty string ALSO falls through to '—'. That's the original behavior
 * — pinned below.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { BuildRow } from '../build-row';
import type { BuildRowProps } from '../build-row';

function render(props: BuildRowProps): React.ReactElement {
  return (BuildRow as unknown as (p: BuildRowProps) => React.ReactElement)(props);
}

describe('BuildRow', () => {
  it('renders a flex container at the root', () => {
    const tree = render({ label: 'Install', value: 'npm install' });
    expect(tree.type).toBe('div');
    const cls = (tree.props as { className: string }).className;
    expect(cls).toContain('flex');
    expect(cls).toContain('items-center');
    expect(cls).toContain('justify-between');
    expect(cls).toContain('text-xs');
  });

  it('renders the label in a muted span', () => {
    const tree = render({ label: 'Install Command', value: 'npm install' });
    const children = (tree.props as { children: unknown }).children as React.ReactElement[];
    const labelSpan = children[0];
    expect(labelSpan.type).toBe('span');
    expect((labelSpan.props as { className: string }).className).toContain('text-ice-text-3');
    expect((labelSpan.props as { children: unknown }).children).toBe('Install Command');
  });

  it('renders the value in a mono span', () => {
    const tree = render({ label: 'Build', value: 'pnpm build' });
    const children = (tree.props as { children: unknown }).children as React.ReactElement[];
    const valueSpan = children[1];
    expect(valueSpan.type).toBe('span');
    const cls = (valueSpan.props as { className: string }).className;
    expect(cls).toContain('font-mono');
    expect(cls).toContain('text-ice-text-2');
    expect((valueSpan.props as { children: unknown }).children).toBe('pnpm build');
  });

  it('renders an em-dash when value is null', () => {
    const tree = render({ label: 'Install', value: null });
    const children = (tree.props as { children: unknown }).children as React.ReactElement[];
    const valueSpan = children[1];
    expect((valueSpan.props as { children: unknown }).children).toBe('—');
  });

  it('renders an em-dash when value is the empty string (|| not ??) — verbatim', () => {
    // Pre-extraction source uses `value || '—'` so empty-string also
    // routes to em-dash. Pin so a future fix to `value ?? '—'` has to
    // update this expectation explicitly.
    const tree = render({ label: 'Install', value: '' });
    const children = (tree.props as { children: unknown }).children as React.ReactElement[];
    const valueSpan = children[1];
    expect((valueSpan.props as { children: unknown }).children).toBe('—');
  });
});
