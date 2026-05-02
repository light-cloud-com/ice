/**
 * Reducer tests for ghost-slice.
 */

import { describe, it, expect } from 'vitest';
import ghostReducer, { setGhosts, dismissGhost, clearGhosts, type GhostNode, type GhostState } from '../ghost-slice';

function init(): GhostState {
  return ghostReducer(undefined, { type: '@@INIT' });
}

function makeGhost(id: string): GhostNode {
  return {
    id,
    iceType: 'Compute.Container',
    label: id,
    position: { x: 0, y: 0 },
    sourceNodeId: 'src',
    edgeRelationship: 'connects_to',
    edgeDirection: 'to',
    createdAt: 0,
  };
}

describe('ghost-slice', () => {
  it('seeds an empty ghosts array', () => {
    expect(init()).toEqual({ ghosts: [] });
  });

  it('setGhosts replaces the array verbatim', () => {
    const s = ghostReducer(init(), setGhosts([makeGhost('a'), makeGhost('b')]));
    expect(s.ghosts).toHaveLength(2);
    expect(s.ghosts.map((g) => g.id)).toEqual(['a', 'b']);
  });

  it('dismissGhost removes by id and leaves others intact', () => {
    let s = ghostReducer(init(), setGhosts([makeGhost('a'), makeGhost('b'), makeGhost('c')]));
    s = ghostReducer(s, dismissGhost('b'));
    expect(s.ghosts.map((g) => g.id)).toEqual(['a', 'c']);
  });

  it('dismissGhost is a no-op for an unknown id', () => {
    let s = ghostReducer(init(), setGhosts([makeGhost('a')]));
    s = ghostReducer(s, dismissGhost('not-there'));
    expect(s.ghosts.map((g) => g.id)).toEqual(['a']);
  });

  it('clearGhosts wipes everything', () => {
    let s = ghostReducer(init(), setGhosts([makeGhost('a'), makeGhost('b')]));
    s = ghostReducer(s, clearGhosts());
    expect(s.ghosts).toEqual([]);
  });
});
