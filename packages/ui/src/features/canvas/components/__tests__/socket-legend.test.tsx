/**
 * SocketLegend (CCL6) — decodes the canvas socket shape/colour language. Pure
 * component; tree-walked via direct invocation.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { SocketLegend, SocketGlyph } from '../socket-legend';

function* walk(node: React.ReactNode): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as React.ReactNode);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  // Invoke function components so their rendered subtree (e.g. SocketGlyph's
  // <svg>) is visible to the predicates.
  if (typeof el.type === 'function') {
    yield* walk((el.type as (p: unknown) => React.ReactNode)(el.props));
    return;
  }
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children != null) yield* walk(children);
}
const all = (tree: React.ReactNode, p: (el: React.ReactElement) => boolean) => [...walk(tree)].filter(p);

function collectText(node: React.ReactNode): string {
  const out: string[] = [];
  const visit = (n: React.ReactNode): void => {
    if (n == null || typeof n === 'boolean') return;
    if (typeof n === 'string' || typeof n === 'number') {
      out.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      n.forEach((c) => visit(c as React.ReactNode));
      return;
    }
    const el = n as React.ReactElement;
    if (typeof el.type === 'function') {
      visit((el.type as (p: unknown) => React.ReactNode)(el.props));
      return;
    }
    visit((el.props as { children?: React.ReactNode } | undefined)?.children);
  };
  visit(node);
  return out.join(' ');
}
const text = collectText;

const renderLegend = () => (SocketLegend as React.FC)({}) as React.ReactElement;

describe('SocketLegend (CCL6)', () => {
  it('renders all four socket shapes', () => {
    const tree = renderLegend();
    const shapes = all(tree, (el) => el.type === 'svg').map(
      (el) => (el.props as { 'data-shape': string })['data-shape'],
    );
    expect(new Set(shapes)).toEqual(new Set(['circle', 'ring', 'diamond', 'square']));
  });

  it('labels each shape with its connection meaning + a title', () => {
    const t = text(renderLegend());
    // Real i18n (default locale).
    expect(t).toContain('Connection sockets');
    expect(t).toContain('Data & traffic');
    expect(t).toContain('Config (env, secrets)');
    expect(t).toContain('Source repository');
    expect(t).toContain('Domain / DNS');
  });
});

describe('SocketGlyph', () => {
  it('renders a filled circle for the circle shape', () => {
    const el = (SocketGlyph as unknown as (p: { shape: string; color: string }) => React.ReactElement)({
      shape: 'circle',
      color: '#22c55e',
    });
    const circle = all(el, (e) => e.type === 'circle')[0];
    expect((circle.props as { fill: string }).fill).toBe('#22c55e');
  });

  it('renders an outlined (no-fill) ring for the ring shape', () => {
    const el = (SocketGlyph as unknown as (p: { shape: string; color: string }) => React.ReactElement)({
      shape: 'ring',
      color: '#f59e0b',
    });
    const circle = all(el, (e) => e.type === 'circle')[0];
    expect((circle.props as { fill: string }).fill).toBe('none');
    expect((circle.props as { stroke: string }).stroke).toBe('#f59e0b');
  });

  it('rotates the diamond shape 45deg', () => {
    const el = (SocketGlyph as unknown as (p: { shape: string; color: string }) => React.ReactElement)({
      shape: 'diamond',
      color: '#8b5cf6',
    });
    const rect = all(el, (e) => e.type === 'rect')[0];
    expect((rect.props as { transform?: string }).transform).toContain('rotate(45');
  });
});
