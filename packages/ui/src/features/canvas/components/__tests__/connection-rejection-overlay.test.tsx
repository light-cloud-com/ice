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
});
