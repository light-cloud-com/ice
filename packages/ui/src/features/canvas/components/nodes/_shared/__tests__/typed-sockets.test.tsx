/**
 * TypedSockets behavior tests — uses the same shallow-render trick as
 * the rest of the canvas tests (call the component as a function) to
 * keep the test simple and dependency-free.
 */

import React from 'react';
import { describe, expect, it } from 'vitest';
import { TypedSockets } from '../typed-sockets';
import type { PortDef } from '@ice/types';

function findByType(tree: React.ReactNode, type: string): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  function walk(n: React.ReactNode): void {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    const el = n as React.ReactElement;
    if (el.type === type) out.push(el);
    // Recurse into function components by calling them — needed to see
    // SocketDot's rendered <circle>/<rect>.
    if (typeof el.type === 'function') {
      const fn = el.type as (p: typeof el.props) => React.ReactNode;
      walk(fn(el.props));
    }
    const children = (el.props as { children?: React.ReactNode })?.children;
    if (children !== undefined) walk(children);
  }
  walk(tree);
  return out;
}

const SOCKETS: PortDef[] = [
  { id: 'traffic-in', side: 'left', role: 'database', direction: 'in', label: 'Traffic input', shape: 'circle' },
  {
    id: 'traffic-out',
    side: 'right',
    role: 'http-endpoint',
    direction: 'out',
    label: 'Traffic output',
    shape: 'circle',
  },
  { id: 'config-in', side: 'left', role: 'env', direction: 'in', label: 'Config input', shape: 'ring' },
  {
    id: 'pipeline-in',
    side: 'left',
    role: 'repository',
    direction: 'in',
    label: 'Pipeline input',
    shape: 'diamond',
  },
];

function render(props: Partial<React.ComponentProps<typeof TypedSockets>> = {}): React.ReactElement {
  const full: React.ComponentProps<typeof TypedSockets> = {
    nodeId: 'n1',
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    sockets: SOCKETS,
    lod: 3,
    ...props,
  };
  // memo() wraps the component; reach into `type.type` to call the raw render.
  const Comp = TypedSockets as unknown as { type: (p: typeof full) => React.ReactElement };
  return Comp.type(full);
}

describe('TypedSockets', () => {
  it('renders one socket per SocketDef at LOD 3', () => {
    const tree = render();
    const circles = findByType(tree, 'circle');
    const rects = findByType(tree, 'rect');
    expect(circles.length + rects.length).toBeGreaterThanOrEqual(SOCKETS.length);
  });

  it('emits data-socket-id / data-side / data-category attributes', () => {
    const tree = render();
    const circles = findByType(tree, 'circle');
    const trafficIn = circles.find((c) => (c.props as Record<string, unknown>)['data-socket-id'] === 'traffic-in');
    expect(trafficIn).toBeDefined();
    const props = trafficIn!.props as Record<string, unknown>;
    expect(props['data-side']).toBe('left');
    expect(props['data-category']).toBe('traffic');
    expect(props['data-direction']).toBe('in');
    expect(props['data-node-id']).toBe('n1');
    expect((props.className as string).includes('connection-port')).toBe(true);
  });

  it('degrades to anonymous L/R dots at LOD < 2', () => {
    const tree = render({ lod: 1 });
    const circles = findByType(tree, 'circle');
    // Two fallback dots (left + right) — never four.
    expect(circles.length).toBe(2);
  });

  it('renders fallback dots when sockets array is empty', () => {
    const tree = render({ sockets: [] });
    const circles = findByType(tree, 'circle');
    expect(circles.length).toBe(2);
  });

  it('honors opacity prop on the group wrapper', () => {
    const tree = render({ opacity: 0.42 });
    expect(((tree.props as Record<string, unknown>).style as Record<string, unknown>).opacity).toBe(0.42);
  });

  it('uses ring shape for config sockets', () => {
    const tree = render();
    const circles = findByType(tree, 'circle');
    const configRing = circles.find((c) => (c.props as Record<string, unknown>)['data-socket-id'] === 'config-in');
    expect(configRing).toBeDefined();
    // The ring shape renders with fill="var(--ice-bg-raised)" and stroke=color.
    expect((configRing!.props as Record<string, unknown>).fill).toBe('var(--ice-bg-raised)');
  });
});
