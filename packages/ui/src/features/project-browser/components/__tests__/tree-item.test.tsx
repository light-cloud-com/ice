/**
 * rf-pbrws-2 — TreeItem leaf component tests.
 *
 * Direct-FC tree-walker with vi.hoisted mock identities. The TreeItem is
 * wrapped in React.memo, so unwrap the inner component via `.type` to call
 * it as a function (cite: react-memo-unwrap-via-type-for-direct-invocation
 * pattern is documented under refactoring-patterns).
 *
 * useState slots (in order):
 *   0=isRenaming (false)
 *   1=renameValue (node.name)
 *   2=isDragOver (false)
 *   3=isDragging (false)
 * Each slot has a mutable ref + a captured setter spy. Tests pre-seed the
 * ref before invoking the FC, and assert against the setter calls.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  tFn: vi.fn((k: string) => `t:${k}`),
  // useState slots
  isRenamingRef: { current: false as boolean },
  renameValueRef: { current: '' as string },
  isDragOverRef: { current: false as boolean },
  isDraggingRef: { current: false as boolean },
  setIsRenamingSpy: vi.fn(),
  setRenameValueSpy: vi.fn(),
  setIsDragOverSpy: vi.fn(),
  setIsDraggingSpy: vi.fn(),
  // useEffect callbacks captured for direct invocation
  effectCallbacks: [] as Array<() => void>,
  // useRef returns a stable object
  inputRefSelectSpy: vi.fn(),
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: mocks.tFn }),
}));

vi.mock('react', async (orig) => {
  const r = (await orig()) as typeof import('react');
  let useStateIdx = 0;
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState = () => {
    useStateIdx = 0;
  };
  const dispatchTable = [
    () => [mocks.isRenamingRef.current, mocks.setIsRenamingSpy] as const,
    () => [mocks.renameValueRef.current, mocks.setRenameValueSpy] as const,
    () => [mocks.isDragOverRef.current, mocks.setIsDragOverSpy] as const,
    () => [mocks.isDraggingRef.current, mocks.setIsDraggingSpy] as const,
  ];
  const useState = <T,>(_init: T): [T, (v: T) => void] => {
    const slot = dispatchTable[useStateIdx] ?? (() => [_init, vi.fn()] as const);
    useStateIdx += 1;
    return slot() as unknown as [T, (v: T) => void];
  };
  const useEffect = (cb: () => void | (() => void)) => {
    mocks.effectCallbacks.push(cb as () => void);
  };
  const useRef = <T,>(init: T): { current: T } => {
    if (init === null) {
      // The inputRef — return an object whose .select() is spy-able.
      return { current: { select: mocks.inputRefSelectSpy } as unknown as T };
    }
    return { current: init };
  };
  return {
    ...r,
    useState,
    useEffect,
    useRef,
    memo: <P,>(fn: P) => fn,
  };
});

import { TreeItem } from '../tree-item';
import type { ProjectNode } from '../../types/project-node';

interface ReactElementLike {
  type: unknown;
  props: { [k: string]: unknown; children?: unknown };
}

function isElement(x: unknown): x is ReactElementLike {
  return !!x && typeof x === 'object' && 'type' in x && 'props' in x;
}

function* walk(node: unknown): Generator<ReactElementLike> {
  if (Array.isArray(node)) {
    for (const c of node) yield* walk(c);
    return;
  }
  if (!isElement(node)) return;
  yield node;
  yield* walk(node.props.children);
}

function findByPredicate(tree: unknown, predicate: (el: ReactElementLike) => boolean): ReactElementLike | undefined {
  for (const el of walk(tree)) {
    if (predicate(el)) return el;
  }
  return undefined;
}

function findAllByPredicate(tree: unknown, predicate: (el: ReactElementLike) => boolean): ReactElementLike[] {
  const out: ReactElementLike[] = [];
  for (const el of walk(tree)) {
    if (predicate(el)) out.push(el);
  }
  return out;
}

function collectText(node: unknown): string {
  const parts: string[] = [];
  function rec(x: unknown) {
    if (typeof x === 'string' || typeof x === 'number') {
      parts.push(String(x));
      return;
    }
    if (Array.isArray(x)) {
      for (const c of x) rec(c);
      return;
    }
    if (isElement(x)) rec(x.props.children);
  }
  rec(node);
  return parts.join(' ');
}

const makeNode = (overrides: Partial<ProjectNode> = {}): ProjectNode => ({
  id: 'n1',
  name: 'Item 1',
  type: 'project',
  parent_id: null,
  cards: [],
  children: [],
  ...overrides,
});

const makeProps = (
  overrides: Partial<React.ComponentProps<typeof TreeItem>> = {},
): React.ComponentProps<typeof TreeItem> => ({
  node: makeNode(),
  level: 0,
  expandedIds: new Set<string>(),
  activeNodeId: null,
  activeSubpage: null,
  onToggle: vi.fn(),
  onOpen: vi.fn(),
  onNavigateSubpage: vi.fn(),
  onRename: vi.fn(),
  onDelete: vi.fn(),
  onCreateIn: vi.fn(),
  onMove: vi.fn(),
  allFolders: [],
  ...overrides,
});

// React.memo is patched to identity in the react mock, so TreeItem is the
// inner FC directly and can be invoked.
const callTreeItem = (props: React.ComponentProps<typeof TreeItem>): unknown => {
  (mocks as unknown as { __resetUseState: () => void }).__resetUseState();
  const Inner = TreeItem as unknown as (p: React.ComponentProps<typeof TreeItem>) => unknown;
  return Inner(props);
};

beforeEach(() => {
  mocks.tFn.mockClear();
  mocks.isRenamingRef.current = false;
  mocks.renameValueRef.current = 'Item 1';
  mocks.isDragOverRef.current = false;
  mocks.isDraggingRef.current = false;
  mocks.setIsRenamingSpy.mockReset();
  mocks.setRenameValueSpy.mockReset();
  mocks.setIsDragOverSpy.mockReset();
  mocks.setIsDraggingSpy.mockReset();
  mocks.effectCallbacks.length = 0;
  mocks.inputRefSelectSpy.mockReset();
});

describe('TreeItem — rendering', () => {
  it('renders a project name as a span', () => {
    const tree = callTreeItem(makeProps({ node: makeNode({ name: 'Hello Project' }) }));
    expect(collectText(tree)).toContain('Hello Project');
  });

  it('renders a folder with a chevron rotated when isOpen', () => {
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'f', type: 'folder' }),
        expandedIds: new Set(['f']),
      }),
    );
    const chevrons = findAllByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('rotate-90'),
    );
    expect(chevrons.length).toBeGreaterThan(0);
  });

  it('does not rotate the chevron when isOpen is false', () => {
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'f', type: 'folder' }),
        expandedIds: new Set<string>(),
      }),
    );
    const rotated = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('rotate-90'),
    );
    expect(rotated).toBeUndefined();
  });

  it('applies active styling when node is the activeNodeId', () => {
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'a' }),
        activeNodeId: 'a',
      }),
    );
    const button = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('group flex items-center'),
    );
    expect(button?.props.className).toContain('text-ice-text-1 font-medium');
  });

  it('uses the indent calc for paddingLeft based on level', () => {
    const tree = callTreeItem(makeProps({ level: 3 }));
    const button = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('group flex items-center'),
    );
    const style = button?.props.style as { paddingLeft?: string };
    // 3 * 14 + 8 = 50
    expect(style.paddingLeft).toContain('50px');
  });

  it('renders the closed-folder icon when folder is collapsed', () => {
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'f', type: 'folder' }),
        expandedIds: new Set<string>(),
      }),
    );
    // FolderOpen icon NOT present, Folder icon IS present (both lucide
    // import strings end up as functions; we look for the non-rotated chevron
    // wrapper as a proxy for closed folder)
    const wrappers = findAllByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('text-amber-400/70'),
    );
    expect(wrappers.length).toBeGreaterThan(0);
  });

  it('renders default (non-active) styling when activeNodeId differs', () => {
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'a' }),
        activeNodeId: 'b',
      }),
    );
    const button = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('group flex items-center'),
    );
    expect(button?.props.className).toContain('text-ice-text-2');
  });

  it('renders the dragging-opacity class when isDragging is true', () => {
    mocks.isDraggingRef.current = true;
    const tree = callTreeItem(makeProps());
    const button = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('group flex items-center'),
    );
    expect(button?.props.className).toContain('opacity-40');
  });

  it('renders the dragOver highlight class for folders when isDragOver is true', () => {
    mocks.isDragOverRef.current = true;
    const tree = callTreeItem(makeProps({ node: makeNode({ id: 'f', type: 'folder' }) }));
    const button = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('group flex items-center'),
    );
    expect(button?.props.className).toContain('bg-blue-500/15');
  });

  it('does not apply dragOver highlight for non-folders even when isDragOver is true', () => {
    mocks.isDragOverRef.current = true;
    const tree = callTreeItem(makeProps({ node: makeNode({ id: 'p', type: 'project' }) }));
    const button = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('group flex items-center'),
    );
    expect(button?.props.className).not.toContain('bg-blue-500/15');
  });
});

describe('TreeItem — click handlers', () => {
  it('calls onToggle when a folder row is clicked', () => {
    const onToggle = vi.fn();
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'f', type: 'folder' }),
        onToggle,
      }),
    );
    const button = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('group flex items-center'),
    );
    (button?.props.onClick as () => void)?.();
    expect(onToggle).toHaveBeenCalledWith('f');
  });

  it('calls onOpen with the node when a project row is clicked', () => {
    const onOpen = vi.fn();
    const node = makeNode({ id: 'p', type: 'project' });
    const tree = callTreeItem(makeProps({ node, onOpen }));
    const button = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('group flex items-center'),
    );
    (button?.props.onClick as () => void)?.();
    expect(onOpen).toHaveBeenCalledWith(node);
  });

  it('chevron wrapper onClick stops propagation and toggles', () => {
    const onToggle = vi.fn();
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'f', type: 'folder' }),
        onToggle,
      }),
    );
    // The chevron wrapper is the inner span around ChevronRight
    const chevWrapper = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('w-4 h-4 flex items-center'),
    );
    const stop = vi.fn();
    (chevWrapper?.props.onClick as (e: { stopPropagation: () => void }) => void)?.({
      stopPropagation: stop,
    });
    expect(stop).toHaveBeenCalled();
    expect(onToggle).toHaveBeenCalledWith('f');
  });

  it('calls onCreateIn when "New project here" is clicked on a folder', () => {
    const onCreateIn = vi.fn();
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'f', type: 'folder' }),
        onCreateIn,
      }),
    );
    const item = findByPredicate(tree, (el) => collectText(el) === 't:projectBrowser.contextNewProjectHere');
    (item?.props.onClick as () => void)?.();
    expect(onCreateIn).toHaveBeenCalledWith('f');
  });

  it('calls onDelete with the node id', () => {
    const onDelete = vi.fn();
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'p' }),
        onDelete,
      }),
    );
    const item = findByPredicate(tree, (el) => collectText(el) === 't:projectBrowser.contextDelete');
    (item?.props.onClick as () => void)?.();
    expect(onDelete).toHaveBeenCalledWith('p');
  });

  // IA5 — the Open submenu lets the user jump to a project subpage from the tree.
  it('calls onNavigateSubpage with the chosen subpage on a project node', () => {
    const onNavigateSubpage = vi.fn();
    const node = makeNode({ id: 'p', type: 'project' });
    const tree = callTreeItem(makeProps({ node, onNavigateSubpage }));
    const item = findByPredicate(tree, (el) => collectText(el) === 't:projectBrowser.subDeployments');
    expect(item).toBeDefined();
    (item?.props.onClick as () => void)?.();
    expect(onNavigateSubpage).toHaveBeenCalledWith(node, 'deployments');
  });

  it('does not render the subpage Open submenu for a folder node', () => {
    const tree = callTreeItem(makeProps({ node: makeNode({ id: 'f', type: 'folder' }) }));
    const item = findByPredicate(tree, (el) => collectText(el) === 't:projectBrowser.subDeployments');
    expect(item).toBeUndefined();
  });

  it('rename menu item flips renameValue + isRenaming state', () => {
    const tree = callTreeItem(makeProps({ node: makeNode({ name: 'Original Name' }) }));
    const item = findByPredicate(tree, (el) => collectText(el) === 't:projectBrowser.contextRename');
    (item?.props.onClick as () => void)?.();
    expect(mocks.setRenameValueSpy).toHaveBeenCalledWith('Original Name');
    expect(mocks.setIsRenamingSpy).toHaveBeenCalledWith(true);
  });

  it('calls onMove with null when "Move to root" is clicked', () => {
    const onMove = vi.fn();
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'p' }),
        onMove,
        allFolders: [makeNode({ id: 'other', type: 'folder' })],
      }),
    );
    const item = findByPredicate(tree, (el) => collectText(el) === 't:projectBrowser.contextMoveRoot');
    (item?.props.onClick as () => void)?.();
    expect(onMove).toHaveBeenCalledWith('p', null);
  });

  it('calls onMove with target folder id when sibling folder is clicked', () => {
    const onMove = vi.fn();
    const targetFolder = makeNode({ id: 'tgt', name: 'Target Folder', type: 'folder' });
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'p' }),
        onMove,
        allFolders: [targetFolder],
      }),
    );
    const candidates = findAllByPredicate(
      tree,
      (el) => typeof el.props.onClick === 'function' && collectText(el).includes('Target Folder'),
    ).sort((a, b) => collectText(a).length - collectText(b).length);
    expect(candidates.length).toBeGreaterThan(0);
    (candidates[0]?.props.onClick as () => void)?.();
    expect(onMove).toHaveBeenCalledWith('p', 'tgt');
  });

  it('omits self from the move-to folder list', () => {
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'self', type: 'folder' }),
        allFolders: [
          makeNode({ id: 'self', name: 'Self', type: 'folder' }),
          makeNode({ id: 'other', name: 'Other', type: 'folder' }),
        ],
      }),
    );
    const items = findAllByPredicate(tree, (el) => collectText(el).includes('Self'));
    expect(items.length).toBe(0);
    const otherItems = findAllByPredicate(tree, (el) => collectText(el).includes('Other'));
    expect(otherItems.length).toBeGreaterThan(0);
  });

  it('hides the move submenu when no other folders are available', () => {
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'self', type: 'folder' }),
        allFolders: [makeNode({ id: 'self', type: 'folder' })],
      }),
    );
    const moveTo = findByPredicate(tree, (el) => collectText(el).includes('t:projectBrowser.contextMoveTo'));
    expect(moveTo).toBeUndefined();
  });

  it('hides the "New project here" item for non-folder nodes', () => {
    const tree = callTreeItem(makeProps({ node: makeNode({ type: 'project' }) }));
    const item = findByPredicate(tree, (el) => collectText(el) === 't:projectBrowser.contextNewProjectHere');
    expect(item).toBeUndefined();
  });

  it('the dropdown wrapper stops click propagation', () => {
    const tree = callTreeItem(makeProps());
    const dropdownWrapper = findByPredicate(
      tree,
      (el) =>
        typeof el.props.className === 'string' &&
        el.props.className.includes('ml-auto opacity-0 group-hover:opacity-100'),
    );
    const stop = vi.fn();
    (dropdownWrapper?.props.onClick as (e: { stopPropagation: () => void }) => void)?.({
      stopPropagation: stop,
    });
    expect(stop).toHaveBeenCalled();
  });
});

describe('TreeItem — drag/drop', () => {
  it('onDragStart sets data, marks dragging, and clones a ghost', () => {
    const node = makeNode({ id: 'p' });
    const tree = callTreeItem(makeProps({ node }));
    const button = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('group flex items-center'),
    );
    const setData = vi.fn();
    const setDragImage = vi.fn();
    const cloneNode = vi.fn(() => ({ style: {} }));
    const fakeEl = { cloneNode, style: {} };
    const fakeEvent = {
      dataTransfer: { setData, setDragImage, effectAllowed: '' },
      currentTarget: fakeEl,
    };
    // Stub document.body for ghost append/remove (not jsdom)
    const append = vi.fn();
    const remove = vi.fn();
    const origDoc = (globalThis as { document?: unknown }).document;
    (globalThis as unknown as { document: unknown }).document = {
      body: { appendChild: append, removeChild: remove },
    };
    const origRAF = globalThis.requestAnimationFrame;
    (globalThis as unknown as { requestAnimationFrame: (cb: () => void) => void }).requestAnimationFrame = (cb) => {
      cb();
      return 0 as unknown as number;
    };
    try {
      (button?.props.onDragStart as (e: unknown) => void)?.(fakeEvent);
      expect(setData).toHaveBeenCalledWith('application/ice-tree-id', 'p');
      expect(fakeEvent.dataTransfer.effectAllowed).toBe('move');
      expect(mocks.setIsDraggingSpy).toHaveBeenCalledWith(true);
      expect(setDragImage).toHaveBeenCalled();
      expect(append).toHaveBeenCalled();
      expect(remove).toHaveBeenCalled();
    } finally {
      (globalThis as unknown as { document: unknown }).document = origDoc as unknown;
      (globalThis as unknown as { requestAnimationFrame: unknown }).requestAnimationFrame = origRAF;
    }
  });

  it('onDragStart skips ghost clone when currentTarget is null', () => {
    const tree = callTreeItem(makeProps({ node: makeNode({ id: 'p' }) }));
    const button = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('group flex items-center'),
    );
    const setData = vi.fn();
    const setDragImage = vi.fn();
    const fakeEvent = {
      dataTransfer: { setData, setDragImage, effectAllowed: '' },
      currentTarget: null,
    };
    (button?.props.onDragStart as (e: unknown) => void)?.(fakeEvent);
    expect(setData).toHaveBeenCalled();
    expect(setDragImage).not.toHaveBeenCalled();
    expect(mocks.setIsDraggingSpy).toHaveBeenCalledWith(true);
  });

  it('onDragEnd clears the dragging state', () => {
    const tree = callTreeItem(makeProps());
    const button = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('group flex items-center'),
    );
    (button?.props.onDragEnd as () => void)?.();
    expect(mocks.setIsDraggingSpy).toHaveBeenCalledWith(false);
  });

  it('onDrop calls onMove(draggedId, this.id) when dropping onto a folder', () => {
    const onMove = vi.fn();
    const onToggle = vi.fn();
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'f', type: 'folder' }),
        onMove,
        onToggle,
        expandedIds: new Set<string>(),
      }),
    );
    const button = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('group flex items-center'),
    );
    const fakeEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { getData: vi.fn(() => 'dragged-id') },
    };
    (button?.props.onDrop as (e: unknown) => void)?.(fakeEvent);
    expect(onMove).toHaveBeenCalledWith('dragged-id', 'f');
    expect(onToggle).toHaveBeenCalledWith('f');
    expect(mocks.setIsDragOverSpy).toHaveBeenCalledWith(false);
  });

  it('onDrop is a no-op for non-folder rows', () => {
    const onMove = vi.fn();
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'p', type: 'project' }),
        onMove,
      }),
    );
    const button = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('group flex items-center'),
    );
    const fakeEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { getData: vi.fn(() => 'dragged-id') },
    };
    (button?.props.onDrop as (e: unknown) => void)?.(fakeEvent);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('onDrop ignores self-drop (draggedId === node.id)', () => {
    const onMove = vi.fn();
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'f', type: 'folder' }),
        onMove,
      }),
    );
    const button = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('group flex items-center'),
    );
    const fakeEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { getData: vi.fn(() => 'f') },
    };
    (button?.props.onDrop as (e: unknown) => void)?.(fakeEvent);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('onDrop ignores empty draggedId', () => {
    const onMove = vi.fn();
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'f', type: 'folder' }),
        onMove,
      }),
    );
    const button = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('group flex items-center'),
    );
    const fakeEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { getData: vi.fn(() => '') },
    };
    (button?.props.onDrop as (e: unknown) => void)?.(fakeEvent);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('onDrop does not call onToggle when folder is already open', () => {
    const onMove = vi.fn();
    const onToggle = vi.fn();
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'f', type: 'folder' }),
        onMove,
        onToggle,
        expandedIds: new Set(['f']),
      }),
    );
    const button = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('group flex items-center'),
    );
    const fakeEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { getData: vi.fn(() => 'dragged-id') },
    };
    (button?.props.onDrop as (e: unknown) => void)?.(fakeEvent);
    expect(onMove).toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('onDragOver sets dropEffect=move and calls preventDefault for folders', () => {
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'f', type: 'folder' }),
      }),
    );
    const button = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('group flex items-center'),
    );
    const fakeEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { dropEffect: '' },
    };
    (button?.props.onDragOver as (e: unknown) => void)?.(fakeEvent);
    expect(fakeEvent.preventDefault).toHaveBeenCalled();
    expect(fakeEvent.dataTransfer.dropEffect).toBe('move');
    expect(mocks.setIsDragOverSpy).toHaveBeenCalledWith(true);
  });

  it('onDragOver is a no-op for projects', () => {
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'p', type: 'project' }),
      }),
    );
    const button = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('group flex items-center'),
    );
    const fakeEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { dropEffect: '' },
    };
    (button?.props.onDragOver as (e: unknown) => void)?.(fakeEvent);
    expect(fakeEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('onDragLeave clears isDragOver when relatedTarget is outside', () => {
    const tree = callTreeItem(makeProps({ node: makeNode({ id: 'f', type: 'folder' }) }));
    const button = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('group flex items-center'),
    );
    const fakeEvent = {
      currentTarget: { contains: vi.fn(() => false) },
      relatedTarget: {},
    };
    (button?.props.onDragLeave as (e: unknown) => void)?.(fakeEvent);
    expect(mocks.setIsDragOverSpy).toHaveBeenCalledWith(false);
  });

  it('onDragLeave keeps isDragOver when relatedTarget is a child', () => {
    const tree = callTreeItem(makeProps({ node: makeNode({ id: 'f', type: 'folder' }) }));
    const button = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('group flex items-center'),
    );
    const fakeEvent = {
      currentTarget: { contains: vi.fn(() => true) },
      relatedTarget: {},
    };
    (button?.props.onDragLeave as (e: unknown) => void)?.(fakeEvent);
    expect(mocks.setIsDragOverSpy).not.toHaveBeenCalled();
  });

  it('draggable=false when isRenaming is true', () => {
    mocks.isRenamingRef.current = true;
    const tree = callTreeItem(makeProps());
    const button = findByPredicate(
      tree,
      (el) => typeof el.props.className === 'string' && el.props.className.includes('group flex items-center'),
    );
    expect(button?.props.draggable).toBe(false);
  });
});

describe('TreeItem — rename input', () => {
  it('renders an input field when isRenaming is true', () => {
    mocks.isRenamingRef.current = true;
    mocks.renameValueRef.current = 'Editing Name';
    const tree = callTreeItem(makeProps({ node: makeNode({ name: 'Editing Name' }) }));
    const input = findByPredicate(tree, (el) => el.type === 'input');
    expect(input).toBeDefined();
    expect(input!.props.value).toBe('Editing Name');
  });

  it('does not render the rename input when isRenaming is false', () => {
    mocks.isRenamingRef.current = false;
    const tree = callTreeItem(makeProps());
    const input = findByPredicate(tree, (el) => el.type === 'input');
    expect(input).toBeUndefined();
  });

  it('input onChange calls setRenameValue with the new value', () => {
    mocks.isRenamingRef.current = true;
    const tree = callTreeItem(makeProps());
    const input = findByPredicate(tree, (el) => el.type === 'input');
    (input!.props.onChange as (e: { target: { value: string } }) => void)({
      target: { value: 'New Value' },
    });
    expect(mocks.setRenameValueSpy).toHaveBeenCalledWith('New Value');
  });

  it('input onClick stops propagation', () => {
    mocks.isRenamingRef.current = true;
    const tree = callTreeItem(makeProps());
    const input = findByPredicate(tree, (el) => el.type === 'input');
    const stop = vi.fn();
    (input!.props.onClick as (e: { stopPropagation: () => void }) => void)({
      stopPropagation: stop,
    });
    expect(stop).toHaveBeenCalled();
  });

  it('Enter key submits rename and calls onRename when value changed', () => {
    const onRename = vi.fn();
    mocks.isRenamingRef.current = true;
    mocks.renameValueRef.current = 'New Name';
    const tree = callTreeItem(makeProps({ node: makeNode({ id: 'p', name: 'Old Name' }), onRename }));
    const input = findByPredicate(tree, (el) => el.type === 'input');
    (input!.props.onKeyDown as (e: { key: string }) => void)({ key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('p', 'New Name');
    expect(mocks.setIsRenamingSpy).toHaveBeenCalledWith(false);
  });

  it('Enter key skips onRename when value is empty after trim', () => {
    const onRename = vi.fn();
    mocks.isRenamingRef.current = true;
    mocks.renameValueRef.current = '   ';
    const tree = callTreeItem(makeProps({ node: makeNode({ id: 'p', name: 'Old' }), onRename }));
    const input = findByPredicate(tree, (el) => el.type === 'input');
    (input!.props.onKeyDown as (e: { key: string }) => void)({ key: 'Enter' });
    expect(onRename).not.toHaveBeenCalled();
    expect(mocks.setIsRenamingSpy).toHaveBeenCalledWith(false);
  });

  it('Enter key skips onRename when value is unchanged', () => {
    const onRename = vi.fn();
    mocks.isRenamingRef.current = true;
    mocks.renameValueRef.current = 'Same';
    const tree = callTreeItem(makeProps({ node: makeNode({ id: 'p', name: 'Same' }), onRename }));
    const input = findByPredicate(tree, (el) => el.type === 'input');
    (input!.props.onKeyDown as (e: { key: string }) => void)({ key: 'Enter' });
    expect(onRename).not.toHaveBeenCalled();
    expect(mocks.setIsRenamingSpy).toHaveBeenCalledWith(false);
  });

  it('Escape key resets value and exits rename mode', () => {
    const onRename = vi.fn();
    mocks.isRenamingRef.current = true;
    mocks.renameValueRef.current = 'Edited';
    const tree = callTreeItem(makeProps({ node: makeNode({ id: 'p', name: 'Original' }), onRename }));
    const input = findByPredicate(tree, (el) => el.type === 'input');
    (input!.props.onKeyDown as (e: { key: string }) => void)({ key: 'Escape' });
    expect(mocks.setRenameValueSpy).toHaveBeenCalledWith('Original');
    expect(mocks.setIsRenamingSpy).toHaveBeenCalledWith(false);
    expect(onRename).not.toHaveBeenCalled();
  });

  it('non-Enter/Escape keys are ignored', () => {
    const onRename = vi.fn();
    mocks.isRenamingRef.current = true;
    mocks.renameValueRef.current = 'Whatever';
    const tree = callTreeItem(makeProps({ node: makeNode({ id: 'p', name: 'Original' }), onRename }));
    const input = findByPredicate(tree, (el) => el.type === 'input');
    (input!.props.onKeyDown as (e: { key: string }) => void)({ key: 'a' });
    expect(onRename).not.toHaveBeenCalled();
    expect(mocks.setIsRenamingSpy).not.toHaveBeenCalled();
  });

  it('onBlur submits the rename', () => {
    const onRename = vi.fn();
    mocks.isRenamingRef.current = true;
    mocks.renameValueRef.current = 'Blurred';
    const tree = callTreeItem(makeProps({ node: makeNode({ id: 'p', name: 'Original' }), onRename }));
    const input = findByPredicate(tree, (el) => el.type === 'input');
    (input!.props.onBlur as () => void)?.();
    expect(onRename).toHaveBeenCalledWith('p', 'Blurred');
    expect(mocks.setIsRenamingSpy).toHaveBeenCalledWith(false);
  });

  it('useEffect selects the input when isRenaming becomes true', () => {
    mocks.isRenamingRef.current = true;
    callTreeItem(makeProps());
    // The captured useEffect callback should call inputRef.current.select()
    expect(mocks.effectCallbacks.length).toBeGreaterThan(0);
    mocks.effectCallbacks[0]();
    expect(mocks.inputRefSelectSpy).toHaveBeenCalled();
  });

  it('useEffect does NOT select when isRenaming is false', () => {
    mocks.isRenamingRef.current = false;
    callTreeItem(makeProps());
    expect(mocks.effectCallbacks.length).toBeGreaterThan(0);
    mocks.effectCallbacks[0]();
    expect(mocks.inputRefSelectSpy).not.toHaveBeenCalled();
  });
});

describe('TreeItem — recursion', () => {
  it('renders children as TreeItem elements when folder is open', () => {
    const child = makeNode({ id: 'c1', name: 'Child One' });
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'f', type: 'folder', children: [child] }),
        expandedIds: new Set(['f']),
      }),
    );
    const childTreeItems = findAllByPredicate(tree, (el) => el.type === TreeItem);
    expect(childTreeItems.length).toBe(1);
    const childProps = childTreeItems[0].props as { node: ProjectNode; level: number };
    expect(childProps.node.id).toBe('c1');
    expect(childProps.level).toBe(1);
  });

  it('does not render children when folder is closed', () => {
    const child = makeNode({ id: 'c1', name: 'Hidden Child' });
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'f', type: 'folder', children: [child] }),
        expandedIds: new Set<string>(),
      }),
    );
    const childTreeItems = findAllByPredicate(tree, (el) => el.type === TreeItem);
    expect(childTreeItems.length).toBe(0);
  });

  it('does not render children for non-folder nodes even with children present', () => {
    const child = makeNode({ id: 'c1', name: 'Orphan Child' });
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'p', type: 'project', children: [child] }),
        expandedIds: new Set(['p']),
      }),
    );
    const childTreeItems = findAllByPredicate(tree, (el) => el.type === TreeItem);
    expect(childTreeItems.length).toBe(0);
  });
});
