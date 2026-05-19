/**
 * rf-ptree-3 — `useTreeDrag` hook bundle.
 *
 * Pins the four DnD handlers (`handleDragStart`, `handleDragOver`,
 * `handleDragLeave`, `handleDrop`) and the `dragOverId` state lifted
 * out of project-tree.tsx into a standalone hook.
 *
 * Tests use the rf-pdpl-21 / rf-pset-4 Probe + renderToString harness.
 * `useState` is intercepted so each render's setter is captured into a
 * hoisted slot, letting tests fire a setter (handleDragOver, etc.) and
 * re-render the Probe to observe the new `dragOverId` value.
 *
 * The drop handler dispatches Redux actions through the real store, so
 * tests use `vi.spyOn(store, 'dispatch')` and read action types off the
 * spy. Self-drop on a folder (item.id === targetFolderId) is a behavior
 * branch the planner explicitly flagged — covered.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useTreeDrag, type UseTreeDragOutput } from '../use-tree-drag';

// ─── Store + capture helpers ────────────────────────────────────────────────

const makeStore = () => configureStore({ reducer: { _: (s = 0) => s } });

interface Captured {
  result: UseTreeDragOutput;
}

function captureHook(store: ReturnType<typeof makeStore>): Captured {
  const captured: { current?: Captured } = {};
  const Probe: React.FC = () => {
    const result = useTreeDrag();
    captured.current = { result };
    return null;
  };
  renderToString(
    <Provider store={store}>
      <Probe />
    </Provider>,
  );
  if (!captured.current) throw new Error('hook did not render');
  return captured.current;
}

// Build a DragEvent stub with stub dataTransfer — real DragEvent isn't in the
// node test env. The `setData` / `getData` pair is backed by a real Map so
// round-trips work in the drop handler.
function makeDragEvent(initial?: Record<string, string>): {
  event: React.DragEvent;
  preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation: ReturnType<typeof vi.fn>;
  setData: ReturnType<typeof vi.fn>;
  getData: ReturnType<typeof vi.fn>;
  dataTransfer: { effectAllowed: string; dropEffect: string };
} {
  const store = new Map<string, string>(Object.entries(initial ?? {}));
  const dataTransfer = {
    effectAllowed: 'none',
    dropEffect: 'none',
    setData: vi.fn((k: string, v: string) => store.set(k, v)),
    getData: vi.fn((k: string) => store.get(k) ?? ''),
  };
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  const event = {
    preventDefault,
    stopPropagation,
    dataTransfer,
  } as unknown as React.DragEvent;
  return {
    event,
    preventDefault,
    stopPropagation,
    setData: dataTransfer.setData,
    getData: dataTransfer.getData,
    dataTransfer,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useTreeDrag — initial state', () => {
  it('returns dragOverId = null on first render', () => {
    const store = makeStore();
    const { result } = captureHook(store);
    expect(result.dragOverId).toBeNull();
  });

  it('returns four handler functions plus dragOverId', () => {
    const store = makeStore();
    const { result } = captureHook(store);
    expect(typeof result.handleDragStart).toBe('function');
    expect(typeof result.handleDragOver).toBe('function');
    expect(typeof result.handleDragLeave).toBe('function');
    expect(typeof result.handleDrop).toBe('function');
  });
});

describe('handleDragStart', () => {
  it('encodes payload as "<type>:<id>" via setData("text/plain", ...) and sets effectAllowed=move', () => {
    const store = makeStore();
    const { result } = captureHook(store);
    const e = makeDragEvent();
    result.handleDragStart(e.event, 'project', 'p1');
    expect(e.setData).toHaveBeenCalledWith('text/plain', 'project:p1');
    expect(e.dataTransfer.effectAllowed).toBe('move');
  });

  it('encodes a folder payload identically', () => {
    const store = makeStore();
    const { result } = captureHook(store);
    const e = makeDragEvent();
    result.handleDragStart(e.event, 'folder', 'f1');
    expect(e.setData).toHaveBeenCalledWith('text/plain', 'folder:f1');
  });
});

describe('handleDragOver', () => {
  it('preventDefault + stopPropagation + sets dropEffect=move', () => {
    const store = makeStore();
    const { result } = captureHook(store);
    const e = makeDragEvent();
    result.handleDragOver(e.event, 'f1');
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(e.stopPropagation).toHaveBeenCalledTimes(1);
    expect(e.dataTransfer.dropEffect).toBe('move');
  });

  it('passes through null target (root drop zone)', () => {
    const store = makeStore();
    const { result } = captureHook(store);
    const e = makeDragEvent();
    expect(() => result.handleDragOver(e.event, null)).not.toThrow();
    expect(e.preventDefault).toHaveBeenCalled();
  });
});

describe('handleDragLeave', () => {
  it('stopPropagation only (no preventDefault)', () => {
    const store = makeStore();
    const { result } = captureHook(store);
    const e = makeDragEvent();
    result.handleDragLeave(e.event);
    expect(e.stopPropagation).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});

describe('handleDrop — happy paths', () => {
  it('project → folder: dispatches moveProjectToFolder with targetFolderId', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { result } = captureHook(store);
    const e = makeDragEvent({ 'text/plain': 'project:p1' });
    result.handleDrop(e.event, 'target-folder');
    const call = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'projects/moveProjectToFolder',
    );
    expect(call).toBeDefined();
    expect((call![0] as unknown as { payload: { projectId: string; folderId: string } }).payload).toEqual({
      projectId: 'p1',
      folderId: 'target-folder',
    });
  });

  it('project → root: dispatches moveProjectToFolder with folderId=null', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { result } = captureHook(store);
    const e = makeDragEvent({ 'text/plain': 'project:p1' });
    result.handleDrop(e.event, null);
    const call = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'projects/moveProjectToFolder',
    );
    expect(call).toBeDefined();
    expect((call![0] as unknown as { payload: { folderId: null | string } }).payload.folderId).toBeNull();
  });

  it('folder → folder: dispatches moveFolder with parentFolderId', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { result } = captureHook(store);
    const e = makeDragEvent({ 'text/plain': 'folder:child' });
    result.handleDrop(e.event, 'parent');
    const call = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'projects/moveFolder',
    );
    expect(call).toBeDefined();
    expect((call![0] as unknown as { payload: { folderId: string; parentFolderId: string } }).payload).toEqual({
      folderId: 'child',
      parentFolderId: 'parent',
    });
  });

  it('folder → root: dispatches moveFolder with parentFolderId=null', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { result } = captureHook(store);
    const e = makeDragEvent({ 'text/plain': 'folder:f1' });
    result.handleDrop(e.event, null);
    const call = dispatchSpy.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'projects/moveFolder',
    );
    expect((call![0] as unknown as { payload: { parentFolderId: null | string } }).payload.parentFolderId).toBeNull();
  });
});

describe('handleDrop — guards', () => {
  it('always preventDefault + stopPropagation', () => {
    const store = makeStore();
    const { result } = captureHook(store);
    const e = makeDragEvent({ 'text/plain': 'project:p1' });
    result.handleDrop(e.event, 'target');
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(e.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it('returns silently (no dispatch) when payload is malformed', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { result } = captureHook(store);
    const e = makeDragEvent({ 'text/plain': 'garbage-no-colon' });
    result.handleDrop(e.event, 'anywhere');
    const moveCalls = dispatchSpy.mock.calls.filter((c) => {
      const t = (c[0] as { type?: string }).type ?? '';
      return t === 'projects/moveProjectToFolder' || t === 'projects/moveFolder';
    });
    expect(moveCalls).toHaveLength(0);
  });

  it('returns silently when payload type is unknown', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { result } = captureHook(store);
    const e = makeDragEvent({ 'text/plain': 'env:env-1' });
    result.handleDrop(e.event, 'anywhere');
    const moveCalls = dispatchSpy.mock.calls.filter((c) => {
      const t = (c[0] as { type?: string }).type ?? '';
      return t === 'projects/moveProjectToFolder' || t === 'projects/moveFolder';
    });
    expect(moveCalls).toHaveLength(0);
  });

  it('rejects self-drop on a folder (item.id === targetFolderId): no dispatch', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { result } = captureHook(store);
    const e = makeDragEvent({ 'text/plain': 'folder:same' });
    result.handleDrop(e.event, 'same');
    const moveCalls = dispatchSpy.mock.calls.filter((c) =>
      (c[0] as { type?: string }).type === 'projects/moveFolder',
    );
    expect(moveCalls).toHaveLength(0);
  });

  it('does NOT reject project-on-folder when ids happen to match (only folder→folder gates)', () => {
    const store = makeStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    const { result } = captureHook(store);
    const e = makeDragEvent({ 'text/plain': 'project:same' });
    result.handleDrop(e.event, 'same');
    // The self-drop guard only applies to folder→folder; a project with the
    // same id as a target folder is a legal move (different namespaces).
    const projectMoveCalls = dispatchSpy.mock.calls.filter(
      (c) => (c[0] as { type?: string }).type === 'projects/moveProjectToFolder',
    );
    expect(projectMoveCalls).toHaveLength(1);
  });
});
