/**
 * Reducer tests for selection-slice.
 *
 * Pure synchronous reducers — no thunks, no external state. Each
 * action is exercised through `selectionReducer(state, action)` to
 * assert the resulting shape; lastSelectedNode invariant is the
 * focus since it has the most branches.
 */

import { describe, it, expect } from 'vitest';
import selectionReducer, {
  setSelectedNodes,
  setSelectedEdges,
  selectAll,
  clearSelection,
  toggleNodeSelection,
  setSelectionRect,
  type SelectionState,
} from '../selection-slice';

function init(): SelectionState {
  return selectionReducer(undefined, { type: '@@INIT' });
}

describe('selection-slice — initial state', () => {
  it('seeds empty arrays + null lastSelected/rect', () => {
    const s = init();
    expect(s).toEqual({
      selectedNodes: [],
      selectedEdges: [],
      lastSelectedNode: null,
      selectionRect: null,
    });
  });
});

describe('setSelectedNodes', () => {
  it('replaces selection and sets lastSelectedNode to the final id', () => {
    const s = selectionReducer(init(), setSelectedNodes(['a', 'b', 'c']));
    expect(s.selectedNodes).toEqual(['a', 'b', 'c']);
    expect(s.lastSelectedNode).toBe('c');
  });

  it('null lastSelectedNode when payload is empty', () => {
    let s = selectionReducer(init(), setSelectedNodes(['a']));
    s = selectionReducer(s, setSelectedNodes([]));
    expect(s.selectedNodes).toEqual([]);
    expect(s.lastSelectedNode).toBeNull();
  });
});

describe('setSelectedEdges', () => {
  it('replaces edge selection without touching nodes/lastSelected', () => {
    let s = selectionReducer(init(), setSelectedNodes(['n']));
    s = selectionReducer(s, setSelectedEdges(['e1', 'e2']));
    expect(s.selectedEdges).toEqual(['e1', 'e2']);
    expect(s.selectedNodes).toEqual(['n']);
    expect(s.lastSelectedNode).toBe('n');
  });
});

describe('selectAll', () => {
  it('writes both arrays in one shot (no lastSelected mutation)', () => {
    const s = selectionReducer(init(), selectAll({ nodes: ['n1', 'n2'], edges: ['e1'] }));
    expect(s.selectedNodes).toEqual(['n1', 'n2']);
    expect(s.selectedEdges).toEqual(['e1']);
    // selectAll is a Ctrl+A action; lastSelectedNode is left at its
    // previous value (null on init).
    expect(s.lastSelectedNode).toBeNull();
  });
});

describe('clearSelection', () => {
  it('wipes nodes, edges, and lastSelectedNode', () => {
    let s = selectionReducer(init(), setSelectedNodes(['a']));
    s = selectionReducer(s, setSelectedEdges(['e']));
    s = selectionReducer(s, clearSelection());
    expect(s).toMatchObject({ selectedNodes: [], selectedEdges: [], lastSelectedNode: null });
  });

  it('preserves selectionRect (cleared independently)', () => {
    let s = selectionReducer(init(), setSelectionRect({ x: 0, y: 0, width: 10, height: 10 }));
    s = selectionReducer(s, clearSelection());
    expect(s.selectionRect).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });
});

describe('toggleNodeSelection', () => {
  it('adds an unselected id and updates lastSelectedNode', () => {
    const s = selectionReducer(init(), toggleNodeSelection('a'));
    expect(s.selectedNodes).toEqual(['a']);
    expect(s.lastSelectedNode).toBe('a');
  });

  it('removes an already-selected id', () => {
    let s = selectionReducer(init(), setSelectedNodes(['a', 'b']));
    s = selectionReducer(s, toggleNodeSelection('a'));
    expect(s.selectedNodes).toEqual(['b']);
  });

  it('shifts lastSelectedNode to the new tail when removing the last one', () => {
    let s = selectionReducer(init(), setSelectedNodes(['a', 'b', 'c']));
    expect(s.lastSelectedNode).toBe('c');
    s = selectionReducer(s, toggleNodeSelection('c'));
    expect(s.selectedNodes).toEqual(['a', 'b']);
    expect(s.lastSelectedNode).toBe('b');
  });

  it('clears lastSelectedNode when removing the only remaining selection', () => {
    let s = selectionReducer(init(), setSelectedNodes(['a']));
    s = selectionReducer(s, toggleNodeSelection('a'));
    expect(s.selectedNodes).toEqual([]);
    expect(s.lastSelectedNode).toBeNull();
  });

  it('leaves lastSelectedNode untouched when removing a NON-last id', () => {
    let s = selectionReducer(init(), setSelectedNodes(['a', 'b', 'c']));
    s = selectionReducer(s, toggleNodeSelection('a'));
    expect(s.selectedNodes).toEqual(['b', 'c']);
    expect(s.lastSelectedNode).toBe('c');
  });
});

describe('setSelectionRect', () => {
  it('writes the rect when payload is non-null', () => {
    const rect = { x: 1, y: 2, width: 3, height: 4 };
    const s = selectionReducer(init(), setSelectionRect(rect));
    expect(s.selectionRect).toEqual(rect);
  });

  it('clears the rect when payload is null', () => {
    let s = selectionReducer(init(), setSelectionRect({ x: 0, y: 0, width: 1, height: 1 }));
    s = selectionReducer(s, setSelectionRect(null));
    expect(s.selectionRect).toBeNull();
  });
});
