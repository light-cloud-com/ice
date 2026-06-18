/**
 * SocketDot — focused on the AX4 reduced-motion gate for the pulsing halo.
 *
 * The halo's pulse is an SVG SMIL `<animate>`, which the CSS
 * `prefers-reduced-motion` net does NOT cover — so it's gated in JS via
 * `prefersReducedMotion()`. These tests drive that branch by stubbing
 * `window.matchMedia` and walking the returned element tree for `<animate>`.
 */

import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { SocketDot, type SocketDotProps } from '../socket-dot';

function* walk(node: React.ReactNode): Generator<React.ReactElement> {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return;
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c as React.ReactNode);
    return;
  }
  const el = node as React.ReactElement;
  yield el;
  const children = (el.props as { children?: React.ReactNode } | undefined)?.children;
  if (children != null) yield* walk(children);
}

const render = (props: Partial<SocketDotProps> = {}) =>
  (SocketDot as unknown as (p: SocketDotProps) => React.ReactElement)({
    socketId: 's1',
    nodeId: 'n1',
    side: 'right',
    role: 'database',
    shape: 'circle',
    direction: 'out',
    label: 'DB out',
    cx: 10,
    cy: 20,
    state: 'snapped',
    ...props,
  });

const hasAnimate = (tree: React.ReactNode) => [...walk(tree)].some((el) => el.type === 'animate');

const setReducedMotion = (matches: boolean) => {
  vi.stubGlobal('window', { matchMedia: () => ({ matches }) });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SocketDot — reduced-motion halo gate (AX4)', () => {
  it('renders the pulsing SMIL <animate> for a snapped port when motion is allowed', () => {
    setReducedMotion(false);
    expect(hasAnimate(render({ state: 'snapped' }))).toBe(true);
  });

  it('renders the pulse for a source-active port when motion is allowed', () => {
    setReducedMotion(false);
    expect(hasAnimate(render({ state: 'source-active' }))).toBe(true);
  });

  it('omits the <animate> when the user prefers reduced motion', () => {
    setReducedMotion(true);
    expect(hasAnimate(render({ state: 'snapped' }))).toBe(false);
    expect(hasAnimate(render({ state: 'source-active' }))).toBe(false);
  });

  it('never animates a resting (idle) port regardless of the preference', () => {
    setReducedMotion(false);
    // idle has no halo at all, so certainly no <animate>.
    expect(hasAnimate(render({ state: 'idle' }))).toBe(false);
  });
});
