/**
 * Tests for `ConnectionRejectionOverlay` — the floating tooltip the
 * canvas renders near the cursor when a connection drop is rejected.
 *
 * The overlay is a tiny SVG group with a centred foreignObject. The
 * tests assert positioning (x is centred around the rejection point,
 * y sits below the cursor) and that the message renders verbatim.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { ConnectionRejectionOverlay } from '../connection-rejection-overlay';

function* walk(node: React.ReactNode): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children == null) return;
  yield* walk(children);
}

const render = (props: React.ComponentProps<typeof ConnectionRejectionOverlay>): React.ReactElement =>
  (
    ConnectionRejectionOverlay as unknown as (
      p: React.ComponentProps<typeof ConnectionRejectionOverlay>,
    ) => React.ReactElement
  )(props);

describe('ConnectionRejectionOverlay', () => {
  it('renders a pointer-events:none wrapping group', () => {
    const tree = render({ rejection: { x: 100, y: 100, message: 'nope' } });
    const props = tree.props as { style?: { pointerEvents?: string } };
    expect(props.style?.pointerEvents).toBe('none');
  });

  it('centres the foreignObject horizontally around rejection.x', () => {
    const tree = render({ rejection: { x: 500, y: 200, message: 'nope' } });
    const fo = [...walk(tree)].find((el) => el.type === 'foreignObject')!;
    const p = fo.props as { x: number; width: number };
    expect(p.x + p.width / 2).toBe(500);
  });

  it('positions the foreignObject below rejection.y', () => {
    const tree = render({ rejection: { x: 0, y: 200, message: 'nope' } });
    const fo = [...walk(tree)].find((el) => el.type === 'foreignObject')!;
    const p = fo.props as { y: number };
    expect(p.y).toBeGreaterThan(200);
  });

  it('renders the rejection message verbatim inside the tooltip body', () => {
    const tree = render({
      rejection: { x: 0, y: 0, message: "Gateway can't connect directly to MySQL" },
    });
    const bodies = [...walk(tree)].filter(
      (el) =>
        el.type === 'div' && (el.props as { 'data-testid'?: string })['data-testid'] === 'connection-rejection-tooltip',
    );
    expect(bodies).toHaveLength(1);
    expect((bodies[0].props as { children?: unknown }).children).toBe("Gateway can't connect directly to MySQL");
  });

  const body = (tree: React.ReactNode) =>
    [...walk(tree)].find(
      (el) =>
        el.type === 'div' && (el.props as { 'data-testid'?: string })['data-testid'] === 'connection-rejection-tooltip',
    )!;
  const fo = (tree: React.ReactNode) => [...walk(tree)].find((el) => el.type === 'foreignObject')!;

  // CCL2 — the overlay lives inside the scaled SVG, so it counter-scales by
  // 1/zoom to keep a constant on-screen size (it used to shrink when zoomed out).
  it('counter-scales by 1/zoom while staying centred', () => {
    const tree = render({ rejection: { x: 500, y: 200, message: 'nope' }, zoom: 0.5 });
    const p = fo(tree).props as { x: number; width: number };
    expect(p.width).toBe(480); // 240 / 0.5
    expect(p.x + p.width / 2).toBe(500); // still centred on rejection.x
    const style = (body(tree).props as { style: { transform: string; width: number } }).style;
    expect(style.transform).toBe('scale(2)');
    expect(style.width).toBe(240); // natural width; the scale fills the foreignObject
  });

  it('clamps the inverse-zoom so a tiny zoom does not blow up unboundedly', () => {
    const tree = render({ rejection: { x: 0, y: 0, message: 'nope' }, zoom: 0.01 });
    // invZoom clamped at 1/0.1 = 10 → width 2400, not 24000.
    expect((fo(tree).props as { width: number }).width).toBe(2400);
  });

  it('defaults to no scaling when zoom is omitted', () => {
    const tree = render({ rejection: { x: 100, y: 100, message: 'nope' } });
    expect((fo(tree).props as { width: number }).width).toBe(240);
    expect((body(tree).props as { style: { transform: string } }).style.transform).toBe('scale(1)');
  });
});
