/**
 * rf-pbrws-2 — TreeItem leaf component tests.
 *
 * Direct-FC tree-walker with vi.hoisted mock identities. The TreeItem is
 * wrapped in React.memo, so unwrap the inner component via `.type` to call
 * it as a function (cite: react-memo-unwrap-via-type-for-direct-invocation
 * pattern is documented under refactoring-patterns).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  tFn: vi.fn((k: string) => `t:${k}`),
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: mocks.tFn }),
}));

// React's useState/useEffect/useRef must passthrough so the FC body runs
// synchronously without a renderer context.
vi.mock('react', async (orig) => {
  const r = (await orig()) as typeof import('react');
  return {
    ...r,
    useState: <T,>(init: T): [T, (v: T) => void] => [init, vi.fn()],
    useEffect: vi.fn(),
    useRef: <T,>(init: T) => ({ current: init }),
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

function findByPredicate(
  tree: unknown,
  predicate: (el: ReactElementLike) => boolean,
): ReactElementLike | undefined {
  for (const el of walk(tree)) {
    if (predicate(el)) return el;
  }
  return undefined;
}

function findAllByPredicate(
  tree: unknown,
  predicate: (el: ReactElementLike) => boolean,
): ReactElementLike[] {
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

const makeProps = (overrides: Partial<React.ComponentProps<typeof TreeItem>> = {}): React.ComponentProps<typeof TreeItem> => ({
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
  const Inner = TreeItem as unknown as (p: React.ComponentProps<typeof TreeItem>) => unknown;
  return Inner(props);
};

describe('TreeItem — rendering', () => {
  beforeEach(() => mocks.tFn.mockClear());

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
});

describe('TreeItem — click handlers', () => {
  beforeEach(() => mocks.tFn.mockClear());

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
    // Find the deepest onClick element whose collected text equals exactly
    // the target name (the DropdownMenu.Item — outer parents have additional
    // text). Most-specific match wins because we sort by collected text length.
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
    // The "Self" folder should not appear as a clickable move target
    const items = findAllByPredicate(tree, (el) => collectText(el).includes('Self'));
    expect(items.length).toBe(0);
    const otherItems = findAllByPredicate(tree, (el) => collectText(el).includes('Other'));
    // Only the dropdown move-target item; "Self" itself appears in the row's
    // own <span>, but with id='self' filtered out, no additional rendering.
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
});

describe('TreeItem — drag/drop', () => {
  beforeEach(() => mocks.tFn.mockClear());

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
});

describe('TreeItem — recursion', () => {
  beforeEach(() => mocks.tFn.mockClear());

  it('renders children as TreeItem elements when folder is open', () => {
    const child = makeNode({ id: 'c1', name: 'Child One' });
    const tree = callTreeItem(
      makeProps({
        node: makeNode({ id: 'f', type: 'folder', children: [child] }),
        expandedIds: new Set(['f']),
      }),
    );
    // The walker yields TreeItem elements as leaves; assert one exists with
    // the child node and bumped level.
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
});
