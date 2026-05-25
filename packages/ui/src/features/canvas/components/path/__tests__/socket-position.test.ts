/**
 * Tests for `socket-position` — the single source of truth for where a
 * socket dot lives in canvas space.
 *
 * Two surfaces:
 *   1. `BESPOKE_SOCKET_POSITIONS` — the schema-shaped table the
 *      dispatcher iterates. Asserts the registered entries are what
 *      we expect (cardinal rule: dispatch is generic, the table IS
 *      the declared fact).
 *   2. `getSocketCanvasPosition` — the dispatcher itself. Covers:
 *      bespoke hit, bespoke miss (falls through), standard layout,
 *      and the dangling-edge null return.
 */

import { describe, it, expect } from 'vitest';
import { BESPOKE_SOCKET_POSITIONS, getSocketCanvasPosition } from '../socket-position';
import type { CanvasNode } from '../../types';

const makeNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'n1',
  type: 'resource',
  x: 100,
  y: 200,
  width: 80,
  height: 40,
  label: 'Node',
  data: {},
  parentId: undefined,
  ...overrides,
});

describe('BESPOKE_SOCKET_POSITIONS table', () => {
  it('registers exactly the bespoke iceTypes that need a custom layout', () => {
    expect(Object.keys(BESPOKE_SOCKET_POSITIONS).sort()).toEqual(['Network.CustomDomain']);
  });

  it('Custom Domain resolver returns a point on the right edge for matching socketIds', () => {
    const node = makeNode({
      data: { iceType: 'Network.CustomDomain', routes: [{ id: 'r1', subdomain: 'a' }] },
    });
    const point = BESPOKE_SOCKET_POSITIONS['Network.CustomDomain'](node, 'domain-out-r1');
    expect(point).not.toBeNull();
    expect(point!.x).toBe(node.x + node.width);
    expect(point!.y).toBeGreaterThan(node.y);
  });

  it('Custom Domain resolver returns null when the route id does not exist', () => {
    const node = makeNode({
      data: { iceType: 'Network.CustomDomain', routes: [{ id: 'r1', subdomain: 'a' }] },
    });
    expect(BESPOKE_SOCKET_POSITIONS['Network.CustomDomain'](node, 'domain-out-MISSING')).toBeNull();
  });

  it('Custom Domain resolver returns null for non-route socket ids (fall-through)', () => {
    const node = makeNode({ data: { iceType: 'Network.CustomDomain', routes: [] } });
    expect(BESPOKE_SOCKET_POSITIONS['Network.CustomDomain'](node, 'some-other-port')).toBeNull();
  });

  it('per-route Y monotonically increases with row index', () => {
    const node = makeNode({
      data: {
        iceType: 'Network.CustomDomain',
        routes: [
          { id: 'r1', subdomain: 'a' },
          { id: 'r2', subdomain: 'b' },
          { id: 'r3', subdomain: 'c' },
        ],
      },
    });
    const y1 = BESPOKE_SOCKET_POSITIONS['Network.CustomDomain'](node, 'domain-out-r1')!.y;
    const y2 = BESPOKE_SOCKET_POSITIONS['Network.CustomDomain'](node, 'domain-out-r2')!.y;
    const y3 = BESPOKE_SOCKET_POSITIONS['Network.CustomDomain'](node, 'domain-out-r3')!.y;
    expect(y2).toBeGreaterThan(y1);
    expect(y3).toBeGreaterThan(y2);
  });
});

describe('getSocketCanvasPosition dispatch', () => {
  it('routes Custom Domain row sockets through the bespoke resolver', () => {
    const node = makeNode({
      data: { iceType: 'Network.CustomDomain', routes: [{ id: 'r1', subdomain: 'a' }] },
    });
    const point = getSocketCanvasPosition(node, 'domain-out-r1');
    const bespoke = BESPOKE_SOCKET_POSITIONS['Network.CustomDomain'](node, 'domain-out-r1');
    expect(point).toEqual(bespoke);
  });

  it('returns null for an unknown socket id on a standard typed-socket node', () => {
    const node = makeNode({ data: { iceType: 'Compute.Container' } });
    expect(getSocketCanvasPosition(node, 'no-such-port')).toBeNull();
  });

  it('returns null for an unknown iceType (no schema, no bespoke)', () => {
    const node = makeNode({ data: { iceType: 'Wholly.Unknown' } });
    expect(getSocketCanvasPosition(node, 'anything')).toBeNull();
  });
});
