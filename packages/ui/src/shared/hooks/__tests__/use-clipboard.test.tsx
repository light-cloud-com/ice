/**
 * useClipboard — Ctrl+C / Ctrl+X / Ctrl+G / Ctrl+V keyboard wiring.
 *
 * Test strategy:
 *   - Mock React's `useEffect` to fire synchronously and stash the
 *     captured callback so the test drives keydown by hand.
 *   - Stub `window.addEventListener('keydown', ...)` to capture the
 *     handler the hook installs.
 *   - Stub `navigator.clipboard.writeText` / `readText` and
 *     `sessionStorage.{getItem,setItem}` so we can drive happy + reject
 *     paths.
 *   - Stub `HTMLInputElement` etc. as classes so the source's
 *     `instanceof` guards run without jsdom.
 *   - Render via Provider + Probe + renderToString (node-only Vitest).
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted state ──────────────────────────────────────────────────────────

interface KeydownInit {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  target?: unknown;
}

const mocks = vi.hoisted(() => {
  const keydownListeners: Array<(e: unknown) => void> = [];
  return {
    keydownListeners,
    writeText: vi.fn(),
    readText: vi.fn(),
    storage: {} as Record<string, string>,
    preventDefault: vi.fn(),
  };
});

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('react', async (orig) => {
  const actual = await orig<typeof import('react')>();
  return {
    ...actual,
    useEffect: (cb: () => void | (() => void)) => {
      cb();
    },
  };
});

// ─── Imports after mocks ────────────────────────────────────────────────────

import cardsReducer, {
  type Card,
  type CardNode,
  type CardEdge,
} from '../../../store/slices/cards-slice';
import selectionReducer from '../../../store/slices/selection-slice';
import { useClipboard } from '../use-clipboard';

// ─── Globals ────────────────────────────────────────────────────────────────

class StubInputEl {}
class StubTextareaEl {}
class StubSelectEl {}

beforeEach(() => {
  mocks.keydownListeners.length = 0;
  mocks.writeText.mockReset();
  mocks.writeText.mockResolvedValue(undefined);
  mocks.readText.mockReset();
  mocks.readText.mockResolvedValue('');
  for (const k of Object.keys(mocks.storage)) delete mocks.storage[k];
  mocks.preventDefault.mockReset();

  vi.stubGlobal('window', {
    addEventListener: (type: string, cb: (e: unknown) => void) => {
      if (type === 'keydown') mocks.keydownListeners.push(cb);
    },
    removeEventListener: (type: string, cb: (e: unknown) => void) => {
      if (type === 'keydown') {
        const i = mocks.keydownListeners.indexOf(cb);
        if (i >= 0) mocks.keydownListeners.splice(i, 1);
      }
    },
  });
  vi.stubGlobal('navigator', {
    clipboard: { writeText: mocks.writeText, readText: mocks.readText },
  });
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => mocks.storage[k] ?? null,
    setItem: (k: string, v: string) => {
      mocks.storage[k] = v;
    },
    removeItem: (k: string) => {
      delete mocks.storage[k];
    },
  });
  vi.stubGlobal('HTMLInputElement', StubInputEl);
  vi.stubGlobal('HTMLTextAreaElement', StubTextareaEl);
  vi.stubGlobal('HTMLSelectElement', StubSelectEl);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function makeNode(partial: Partial<CardNode> & { id: string }): CardNode {
  return {
    id: partial.id,
    type: partial.type ?? 'block',
    position: partial.position ?? { x: 0, y: 0 },
    width: partial.width ?? 100,
    height: partial.height ?? 60,
    parentId: partial.parentId,
    data: partial.data ?? {},
  } as CardNode;
}

function makeStore({
  nodes = [],
  edges = [],
  selectedNodes = [],
  cardId = 'card-1',
}: {
  nodes?: CardNode[];
  edges?: CardEdge[];
  selectedNodes?: string[];
  cardId?: string | null;
}) {
  const card: Card | null = cardId
    ? { id: cardId, name: 'C', nodes, edges, viewport: { panX: 0, panY: 0, scale: 1 }, createdAt: 0 }
    : null;
  return configureStore({
    reducer: { cards: cardsReducer, selection: selectionReducer } as any,
    preloadedState: {
      cards: { activeCardId: card ? card.id : null, cards: card ? [card] : [], history: {} },
      selection: { selectedNodes, selectedEdges: [], lastSelectedNode: null, selectionRect: null },
    } as any,
    middleware: (g) => g({ serializableCheck: false, immutableCheck: false }),
  });
}

function mount(store: ReturnType<typeof makeStore>) {
  const Probe: React.FC = () => {
    useClipboard();
    return null;
  };
  renderToString(
    <Provider store={store}>
      <Probe />
    </Provider>,
  );
}

function fire(init: KeydownInit) {
  const ev = {
    key: init.key,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    target: init.target ?? {},
    preventDefault: mocks.preventDefault,
  };
  for (const cb of [...mocks.keydownListeners]) cb(ev);
  return ev;
}

// ────────────────────────────────────────────────────────────────────────────

describe('useClipboard', () => {
  it('registers a keydown listener and removes it on cleanup', () => {
    const store = makeStore({});
    mount(store);
    expect(mocks.keydownListeners.length).toBe(1);
  });

  it('ignores keys when no Ctrl/Meta modifier', async () => {
    const store = makeStore({
      nodes: [makeNode({ id: 'n-1' })],
      selectedNodes: ['n-1'],
    });
    mount(store);
    fire({ key: 'c' });
    await flush();
    expect(mocks.writeText).not.toHaveBeenCalled();
  });

  it('ignores keypress when target is an input/textarea/select element', async () => {
    const store = makeStore({
      nodes: [makeNode({ id: 'n-1' })],
      selectedNodes: ['n-1'],
    });
    mount(store);
    fire({ key: 'c', ctrlKey: true, target: new StubInputEl() });
    fire({ key: 'c', ctrlKey: true, target: new StubTextareaEl() });
    fire({ key: 'c', ctrlKey: true, target: new StubSelectEl() });
    await flush();
    expect(mocks.writeText).not.toHaveBeenCalled();
  });

  describe('Copy (Ctrl+C)', () => {
    it('writes selected nodes + edges to navigator.clipboard', async () => {
      const store = makeStore({
        nodes: [makeNode({ id: 'n-1' }), makeNode({ id: 'n-2' })],
        edges: [{ id: 'e-1', source: 'n-1', target: 'n-2' }],
        selectedNodes: ['n-1', 'n-2'],
      });
      mount(store);
      fire({ key: 'c', ctrlKey: true });
      await flush();
      expect(mocks.writeText).toHaveBeenCalledTimes(1);
      const written = JSON.parse(mocks.writeText.mock.calls[0][0] as string);
      expect(written.type).toBe('ice-clipboard');
      expect(written.nodes).toHaveLength(2);
      expect(written.edges).toHaveLength(1);
    });

    it('also includes children of a selected group', async () => {
      const store = makeStore({
        nodes: [
          makeNode({ id: 'g-1' }),
          makeNode({ id: 'c-1', parentId: 'g-1' }),
          makeNode({ id: 'c-2', parentId: 'g-1' }),
        ],
        edges: [{ id: 'e-1', source: 'c-1', target: 'c-2' }],
        selectedNodes: ['g-1'],
      });
      mount(store);
      fire({ key: 'c', ctrlKey: true });
      await flush();
      const written = JSON.parse(mocks.writeText.mock.calls[0][0] as string);
      // Group + 2 children + the edge between children.
      expect(written.nodes).toHaveLength(3);
      expect(written.edges).toHaveLength(1);
    });

    it('does nothing when selection is empty', async () => {
      const store = makeStore({
        nodes: [makeNode({ id: 'n-1' })],
        selectedNodes: [],
      });
      mount(store);
      fire({ key: 'c', ctrlKey: true });
      await flush();
      expect(mocks.writeText).not.toHaveBeenCalled();
    });

    it('does nothing when there is no active card', async () => {
      const store = makeStore({ cardId: null, selectedNodes: ['n-1'] });
      mount(store);
      fire({ key: 'c', ctrlKey: true });
      await flush();
      expect(mocks.writeText).not.toHaveBeenCalled();
    });

    it('falls back to sessionStorage when clipboard.writeText rejects', async () => {
      mocks.writeText.mockRejectedValue(new Error('permission-denied'));
      const store = makeStore({
        nodes: [makeNode({ id: 'n-1' })],
        selectedNodes: ['n-1'],
      });
      mount(store);
      fire({ key: 'c', ctrlKey: true });
      await flush();
      await flush(); // catch handler runs on a microtask
      expect(mocks.storage['ice-clipboard']).toBeDefined();
      const stored = JSON.parse(mocks.storage['ice-clipboard']);
      expect(stored.type).toBe('ice-clipboard');
    });

    it('uses metaKey (Cmd on macOS) interchangeably with ctrlKey', async () => {
      const store = makeStore({
        nodes: [makeNode({ id: 'n-1' })],
        selectedNodes: ['n-1'],
      });
      mount(store);
      fire({ key: 'c', metaKey: true });
      await flush();
      expect(mocks.writeText).toHaveBeenCalledTimes(1);
    });

    it('only filters edges that fully sit inside the selection', async () => {
      const store = makeStore({
        nodes: [makeNode({ id: 'n-1' }), makeNode({ id: 'n-2' }), makeNode({ id: 'n-3' })],
        edges: [
          { id: 'e-1', source: 'n-1', target: 'n-2' },
          { id: 'e-2', source: 'n-2', target: 'n-3' }, // n-3 is not selected.
        ],
        selectedNodes: ['n-1', 'n-2'],
      });
      mount(store);
      fire({ key: 'c', ctrlKey: true });
      await flush();
      const written = JSON.parse(mocks.writeText.mock.calls[0][0] as string);
      expect(written.edges).toHaveLength(1);
      expect(written.edges[0].id).toBe('e-1');
    });
  });

  describe('Cut (Ctrl+X)', () => {
    it('writes to clipboard, deletes selected nodes, clears selection', async () => {
      const store = makeStore({
        nodes: [makeNode({ id: 'n-1' }), makeNode({ id: 'n-2' })],
        selectedNodes: ['n-1'],
      });
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      mount(store);
      dispatchSpy.mockClear();
      fire({ key: 'x', ctrlKey: true });
      await flush();
      expect(mocks.writeText).toHaveBeenCalledTimes(1);
      // Two dispatches: deleteCardNode(n-1) + setSelectedNodes([]).
      const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
      expect(types).toContain('cards/deleteCardNode');
      expect(types).toContain('selection/setSelectedNodes');
    });

    it('does nothing when nothing is selected', async () => {
      const store = makeStore({
        nodes: [makeNode({ id: 'n-1' })],
        selectedNodes: [],
      });
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      mount(store);
      dispatchSpy.mockClear();
      fire({ key: 'x', ctrlKey: true });
      await flush();
      expect(mocks.writeText).not.toHaveBeenCalled();
      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('falls back to sessionStorage when clipboard rejects (and still deletes)', async () => {
      mocks.writeText.mockRejectedValue(new Error('denied'));
      const store = makeStore({
        nodes: [makeNode({ id: 'n-1' })],
        selectedNodes: ['n-1'],
      });
      mount(store);
      fire({ key: 'x', ctrlKey: true });
      await flush();
      await flush();
      expect(mocks.storage['ice-clipboard']).toBeDefined();
    });
  });

  describe('Group (Ctrl+G)', () => {
    it('dispatches groupSelectedNodes when 2+ are selected and prevents default', async () => {
      const store = makeStore({
        nodes: [makeNode({ id: 'n-1' }), makeNode({ id: 'n-2' })],
        selectedNodes: ['n-1', 'n-2'],
      });
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      mount(store);
      dispatchSpy.mockClear();
      fire({ key: 'g', ctrlKey: true });
      const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
      expect(types).toContain('cards/groupSelectedNodes');
      expect(mocks.preventDefault).toHaveBeenCalled();
    });

    it('does NOT dispatch groupSelectedNodes when fewer than 2 are selected', async () => {
      const store = makeStore({
        nodes: [makeNode({ id: 'n-1' })],
        selectedNodes: ['n-1'],
      });
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      mount(store);
      dispatchSpy.mockClear();
      fire({ key: 'g', ctrlKey: true });
      const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
      expect(types).not.toContain('cards/groupSelectedNodes');
      // preventDefault still called (the early return is inside the
      // length check, not the modifier check).
      expect(mocks.preventDefault).toHaveBeenCalled();
    });
  });

  describe('Paste (Ctrl+V)', () => {
    it('reads clipboard, parses ice-clipboard JSON, dispatches add nodes/edges + select', async () => {
      const payload = {
        type: 'ice-clipboard',
        nodes: [
          { id: 'orig-1', type: 'block', position: { x: 10, y: 20 }, width: 100, height: 60, data: {} },
        ],
        edges: [],
      };
      mocks.readText.mockResolvedValue(JSON.stringify(payload));
      const store = makeStore({});
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      mount(store);
      dispatchSpy.mockClear();
      fire({ key: 'v', ctrlKey: true });
      // Wait for navigator.clipboard.readText().then(...) chain.
      await flush();
      await flush();
      const types = dispatchSpy.mock.calls.map((c) => (c[0] as { type: string }).type);
      expect(types).toContain('cards/addNodeToCard');
      expect(types).toContain('selection/setSelectedNodes');
    });

    it('parses pasted edges, generating fresh ids', async () => {
      const payload = {
        type: 'ice-clipboard',
        nodes: [
          { id: 'a', type: 'block', position: { x: 0, y: 0 }, width: 100, height: 60, data: {} },
          { id: 'b', type: 'block', position: { x: 100, y: 0 }, width: 100, height: 60, data: {} },
        ],
        edges: [{ id: 'old-edge', source: 'a', target: 'b' }],
      };
      mocks.readText.mockResolvedValue(JSON.stringify(payload));
      const store = makeStore({});
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      mount(store);
      dispatchSpy.mockClear();
      fire({ key: 'v', ctrlKey: true });
      await flush();
      await flush();
      const edgeAdds = dispatchSpy.mock.calls
        .map((c) => c[0] as { type: string; payload?: { id: string } })
        .filter((a) => a.type === 'cards/addEdgeToCard');
      expect(edgeAdds).toHaveLength(1);
      expect(edgeAdds[0].payload?.id).not.toBe('old-edge');
    });

    it('preserves parent->child link by remapping parentId via idMap', async () => {
      const payload = {
        type: 'ice-clipboard',
        nodes: [
          { id: 'parent', type: 'block', position: { x: 0, y: 0 }, width: 100, height: 60, data: {} },
          { id: 'child', type: 'block', position: { x: 0, y: 0 }, width: 50, height: 30, parentId: 'parent', data: {} },
        ],
        edges: [],
      };
      mocks.readText.mockResolvedValue(JSON.stringify(payload));
      const store = makeStore({});
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      mount(store);
      dispatchSpy.mockClear();
      fire({ key: 'v', ctrlKey: true });
      await flush();
      await flush();
      const adds = dispatchSpy.mock.calls
        .map((c) => c[0] as { type: string; payload?: { id: string; parentId?: string } })
        .filter((a) => a.type === 'cards/addNodeToCard');
      expect(adds).toHaveLength(2);
      // Parents land before children — sortedNodes ordering.
      const parentAdd = adds[0];
      const childAdd = adds[1];
      expect(childAdd.payload?.parentId).toBe(parentAdd.payload?.id);
      expect(childAdd.payload?.parentId).not.toBe('parent');
    });

    it('handles empty clipboard text (JSON.parse fails) and tries sessionStorage', async () => {
      mocks.readText.mockResolvedValue('');
      mocks.storage['ice-clipboard'] = JSON.stringify({
        type: 'ice-clipboard',
        nodes: [{ id: 'sx', type: 'block', position: { x: 0, y: 0 }, width: 100, height: 60, data: {} }],
        edges: [],
      });
      const store = makeStore({});
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      mount(store);
      dispatchSpy.mockClear();
      fire({ key: 'v', ctrlKey: true });
      await flush();
      await flush();
      const addCalls = dispatchSpy.mock.calls.filter((c) => (c[0] as { type: string }).type === 'cards/addNodeToCard');
      expect(addCalls.length).toBe(1);
    });

    it('ignores malformed clipboard payload (wrong type field)', async () => {
      mocks.readText.mockResolvedValue(JSON.stringify({ type: 'something-else', nodes: [], edges: [] }));
      const store = makeStore({});
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      mount(store);
      dispatchSpy.mockClear();
      fire({ key: 'v', ctrlKey: true });
      await flush();
      await flush();
      const addCalls = dispatchSpy.mock.calls.filter((c) => (c[0] as { type: string }).type === 'cards/addNodeToCard');
      expect(addCalls).toHaveLength(0);
    });

    it('ignores clipboard read rejection and falls back to sessionStorage', async () => {
      mocks.readText.mockRejectedValue(new Error('not-allowed'));
      mocks.storage['ice-clipboard'] = JSON.stringify({
        type: 'ice-clipboard',
        nodes: [{ id: 'sx', type: 'block', position: { x: 0, y: 0 }, width: 100, height: 60, data: {} }],
        edges: [],
      });
      const store = makeStore({});
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      mount(store);
      dispatchSpy.mockClear();
      fire({ key: 'v', ctrlKey: true });
      await flush();
      await flush();
      const addCalls = dispatchSpy.mock.calls.filter((c) => (c[0] as { type: string }).type === 'cards/addNodeToCard');
      expect(addCalls).toHaveLength(1);
    });

    it('does nothing when clipboard read rejects AND sessionStorage is empty', async () => {
      mocks.readText.mockRejectedValue(new Error('boom'));
      const store = makeStore({});
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      mount(store);
      dispatchSpy.mockClear();
      fire({ key: 'v', ctrlKey: true });
      await flush();
      await flush();
      const addCalls = dispatchSpy.mock.calls.filter((c) => (c[0] as { type: string }).type === 'cards/addNodeToCard');
      expect(addCalls).toHaveLength(0);
    });

    it('ignores stored sessionStorage payload when its JSON is invalid', async () => {
      mocks.readText.mockResolvedValue('not-json');
      mocks.storage['ice-clipboard'] = '{not-valid';
      const store = makeStore({});
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      mount(store);
      dispatchSpy.mockClear();
      fire({ key: 'v', ctrlKey: true });
      await flush();
      await flush();
      const addCalls = dispatchSpy.mock.calls.filter((c) => (c[0] as { type: string }).type === 'cards/addNodeToCard');
      expect(addCalls).toHaveLength(0);
    });

    it('ignores stored sessionStorage payload with wrong type field', async () => {
      mocks.readText.mockRejectedValue(new Error('denied'));
      mocks.storage['ice-clipboard'] = JSON.stringify({ type: 'wrong', nodes: [], edges: [] });
      const store = makeStore({});
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      mount(store);
      dispatchSpy.mockClear();
      fire({ key: 'v', ctrlKey: true });
      await flush();
      await flush();
      const addCalls = dispatchSpy.mock.calls.filter((c) => (c[0] as { type: string }).type === 'cards/addNodeToCard');
      expect(addCalls).toHaveLength(0);
    });

    it('sort-comparator: a node with a parentId that is NOT in idMap is treated as non-child', async () => {
      // Drives the `idMap.has(a.parentId)` falsy arm in the sort comparator.
      // The node has `parentId: 'someone-not-in-payload'` so the lookup
      // returns false, the comparator treats it as 0 (non-child).
      const payload = {
        type: 'ice-clipboard',
        nodes: [
          {
            id: 'orphan',
            type: 'block',
            position: { x: 0, y: 0 },
            width: 100,
            height: 60,
            parentId: 'never-included',
            data: {},
          },
        ],
        edges: [],
      };
      mocks.readText.mockResolvedValue(JSON.stringify(payload));
      const store = makeStore({});
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      mount(store);
      dispatchSpy.mockClear();
      fire({ key: 'v', ctrlKey: true });
      await flush();
      await flush();
      const adds = dispatchSpy.mock.calls
        .map((c) => c[0] as { type: string; payload?: { id: string; parentId?: string } })
        .filter((a) => a.type === 'cards/addNodeToCard');
      expect(adds).toHaveLength(1);
      // parentId mapping: idMap.get('never-included') is undefined, so
      // `idMap.get(node.parentId) || undefined` resolves to undefined.
      expect(adds[0].payload?.parentId).toBeUndefined();
    });

    it('preserves edge endpoints by remapping with idMap', async () => {
      const payload = {
        type: 'ice-clipboard',
        nodes: [
          { id: 'a', type: 'block', position: { x: 0, y: 0 }, width: 100, height: 60, data: {} },
        ],
        edges: [
          { id: 'e-1', source: 'a', target: 'orphan-not-in-nodes' },
        ],
      };
      mocks.readText.mockResolvedValue(JSON.stringify(payload));
      const store = makeStore({});
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      mount(store);
      dispatchSpy.mockClear();
      fire({ key: 'v', ctrlKey: true });
      await flush();
      await flush();
      const edgeAdds = dispatchSpy.mock.calls
        .map((c) => c[0] as { type: string; payload?: { source: string; target: string } })
        .filter((a) => a.type === 'cards/addEdgeToCard');
      expect(edgeAdds).toHaveLength(1);
      // 'a' was in the idMap → source remapped to a fresh id.
      expect(edgeAdds[0].payload?.source).not.toBe('a');
      // 'orphan-not-in-nodes' was not in the idMap → target falls back to original.
      expect(edgeAdds[0].payload?.target).toBe('orphan-not-in-nodes');
    });
  });

  it('ignores keys that are not c/x/g/v with the modifier', async () => {
    const store = makeStore({
      nodes: [makeNode({ id: 'n-1' })],
      selectedNodes: ['n-1'],
    });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    mount(store);
    dispatchSpy.mockClear();
    fire({ key: 'a', ctrlKey: true });
    fire({ key: 'z', ctrlKey: true });
    fire({ key: 'Enter', ctrlKey: true });
    await flush();
    expect(mocks.writeText).not.toHaveBeenCalled();
    expect(mocks.readText).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});
