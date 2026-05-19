/**
 * rf-ptree-7 — `FolderRow` component.
 *
 * Direct-FC tree-walker pattern (rf-props-6 / rf-pdpl-7..15). Tests cover
 * the recursive folder, the drag-target highlight, the amber-themed edit
 * input, the item-count badge math, the four DnD wires (start, over,
 * leave, drop), and the `renderProject` prop being invoked once per child
 * project. Recursion is asserted by counting nested FolderRow elements
 * (matched by reference equality on `el.type`).
 *
 * Lucide icons matched by className substring per rf-pdpl-14.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { FolderRow, type FolderRowProps } from '../folder-row';
import type { Project, ProjectFolder } from '../../../../store/slices/projects-slice';

const FOLDER_ROOT: ProjectFolder = {
  id: 'f-root',
  name: 'Root Folder',
  organisationId: 'org-1',
  parentFolderId: null,
  expanded: true,
  order: 0,
};
const FOLDER_NESTED: ProjectFolder = {
  id: 'f-nested',
  name: 'Nested Folder',
  organisationId: 'org-1',
  parentFolderId: 'f-root',
  expanded: false,
  order: 0,
};
const PROJECT_A: Project = {
  id: 'p-A',
  name: 'Alpha',
  description: '',
  provider: 'gcp',
  organisationId: 'org-1',
  environments: [],
  folderId: 'f-root',
  order: 0,
  expanded: false,
  createdAt: 0,
};
const PROJECT_B: Project = { ...PROJECT_A, id: 'p-B', name: 'Beta', folderId: 'f-root', order: 1 };

type Fn = (p: FolderRowProps) => React.ReactElement;

const renderProjectMock = vi.fn((project: Project, _depth: number) => (
  <div data-testid="project-stub" data-id={project.id} />
));

const baseProps = (overrides: Partial<FolderRowProps> = {}): FolderRowProps => ({
  folder: FOLDER_ROOT,
  depth: 0,
  folders: [FOLDER_ROOT, FOLDER_NESTED],
  projects: [PROJECT_A, PROJECT_B],
  editingId: null,
  editingName: '',
  dragOverId: null,
  editInputRef: { current: null } as React.RefObject<HTMLInputElement>,
  renderProject: renderProjectMock,
  onDragStart: vi.fn(),
  onDragOver: vi.fn(),
  onDragLeave: vi.fn(),
  onDrop: vi.fn(),
  onContextMenu: vi.fn(),
  onFinishRename: vi.fn(),
  onToggleExpanded: vi.fn(),
  setEditingId: vi.fn(),
  setEditingName: vi.fn(),
  ...overrides,
});

const render = (overrides: Partial<FolderRowProps> = {}): React.ReactElement =>
  (FolderRow as unknown as Fn)(baseProps(overrides));

function findAll(el: unknown, pred: (e: React.ReactElement) => boolean): React.ReactElement[] {
  if (el == null || typeof el !== 'object') return [];
  // Arrays of React nodes (e.g. children inside a Fragment) — recurse into each.
  if (Array.isArray(el)) {
    const out: React.ReactElement[] = [];
    for (const c of el) out.push(...findAll(c, pred));
    return out;
  }
  const out: React.ReactElement[] = [];
  const re = el as React.ReactElement;
  if (pred(re)) out.push(re);
  const children = re.props?.children;
  const arr = Array.isArray(children) ? children : [children];
  for (const c of arr) {
    out.push(...findAll(c, pred));
  }
  return out;
}

const collectText = (el: React.ReactElement | string | number | boolean | null | undefined): string => {
  if (el == null || typeof el === 'boolean') return '';
  if (typeof el === 'string' || typeof el === 'number') return String(el);
  const children = (el as React.ReactElement).props?.children;
  const arr = Array.isArray(children) ? children : [children];
  return arr.map((c) => collectText(c)).join('');
};

const classOf = (el: React.ReactElement): string => (el.props?.className as string | undefined) ?? '';

const getHeaderRow = (tree: React.ReactElement): React.ReactElement => {
  const arr = Array.isArray(tree.props?.children) ? tree.props.children : [tree.props.children];
  const div = arr.find(
    (c: unknown): c is React.ReactElement =>
      c != null && typeof c === 'object' && (c as React.ReactElement).type === 'div',
  );
  if (!div) throw new Error('header div not found');
  return div;
};

// ────────────────────────────────────────────────────────────────────────────

describe('FolderRow — base render', () => {
  it('renders the folder name', () => {
    const tree = render();
    expect(collectText(tree)).toContain('Root Folder');
  });

  it('shows item count = childFolders.length + childProjects.length', () => {
    const tree = render();
    // f-root has 1 child folder (f-nested) + 2 child projects = 3
    const badges = findAll(tree, (el) => classOf(el).includes('tabular-nums'));
    expect(badges).toHaveLength(1);
    expect(collectText(badges[0])).toBe('3');
  });

  it('hides item count when folder has no children', () => {
    const tree = render({ folder: { ...FOLDER_NESTED, expanded: true }, projects: [], folders: [FOLDER_NESTED] });
    const badges = findAll(tree, (el) => classOf(el).includes('tabular-nums'));
    expect(badges).toHaveLength(0);
  });

  it('depth-driven left padding (depth=2 → 40px)', () => {
    const tree = render({ depth: 2 });
    const header = getHeaderRow(tree);
    const style = header.props.style as React.CSSProperties;
    expect(style.paddingLeft).toBe('calc(40px * var(--ice-space-scale, 1))');
  });
});

describe('FolderRow — drag target highlight', () => {
  it('applies green tint when dragOverId === folder.id', () => {
    const tree = render({ dragOverId: 'f-root' });
    const header = getHeaderRow(tree);
    expect(classOf(header)).toContain('bg-green-500/15');
    expect(classOf(header)).toContain('text-green-400');
  });

  it('does NOT apply green tint when dragOverId is for a different folder', () => {
    const tree = render({ dragOverId: 'other-folder' });
    const header = getHeaderRow(tree);
    expect(classOf(header)).toContain('hover:bg-ice-hover');
    expect(classOf(header)).not.toContain('bg-green-500/15');
  });
});

describe('FolderRow — DnD wiring', () => {
  it('header.onDragStart calls onDragStart(e, "folder", folder.id)', () => {
    const onDragStart = vi.fn();
    const tree = render({ onDragStart });
    const header = getHeaderRow(tree);
    const ev = {} as React.DragEvent;
    (header.props.onDragStart as (e: React.DragEvent) => void)(ev);
    expect(onDragStart).toHaveBeenCalledWith(ev, 'folder', 'f-root');
  });

  it('header.onDragOver calls onDragOver(e, folder.id)', () => {
    const onDragOver = vi.fn();
    const tree = render({ onDragOver });
    const header = getHeaderRow(tree);
    const ev = {} as React.DragEvent;
    (header.props.onDragOver as (e: React.DragEvent) => void)(ev);
    expect(onDragOver).toHaveBeenCalledWith(ev, 'f-root');
  });

  it('header.onDragLeave wires onDragLeave directly', () => {
    const onDragLeave = vi.fn();
    const tree = render({ onDragLeave });
    const header = getHeaderRow(tree);
    expect(header.props.onDragLeave).toBe(onDragLeave);
  });

  it('header.onDrop calls onDrop(e, folder.id)', () => {
    const onDrop = vi.fn();
    const tree = render({ onDrop });
    const header = getHeaderRow(tree);
    const ev = {} as React.DragEvent;
    (header.props.onDrop as (e: React.DragEvent) => void)(ev);
    expect(onDrop).toHaveBeenCalledWith(ev, 'f-root');
  });
});

describe('FolderRow — header click + context menu', () => {
  it('header.onClick calls onToggleExpanded(folder.id) when not editing', () => {
    const onToggleExpanded = vi.fn();
    const tree = render({ onToggleExpanded });
    const header = getHeaderRow(tree);
    (header.props.onClick as () => void)();
    expect(onToggleExpanded).toHaveBeenCalledWith('f-root');
  });

  it('header.onClick is a no-op when editing', () => {
    const onToggleExpanded = vi.fn();
    const tree = render({ editingId: 'f-root', onToggleExpanded });
    const header = getHeaderRow(tree);
    (header.props.onClick as () => void)();
    expect(onToggleExpanded).not.toHaveBeenCalled();
  });

  it('header.onContextMenu calls onContextMenu(e, "folder", id)', () => {
    const onContextMenu = vi.fn();
    const tree = render({ onContextMenu });
    const header = getHeaderRow(tree);
    const ev = {} as React.MouseEvent;
    (header.props.onContextMenu as (e: React.MouseEvent) => void)(ev);
    expect(onContextMenu).toHaveBeenCalledWith(ev, 'folder', 'f-root');
  });

  it('More button calls onContextMenu with stopPropagation', () => {
    const onContextMenu = vi.fn();
    const tree = render({ onContextMenu });
    const moreButton = findAll(
      tree,
      (el) => el.type === 'button' && classOf(el).includes('opacity-0 group-hover:opacity-100'),
    )[0];
    expect(moreButton).toBeDefined();
    const stopPropagation = vi.fn();
    (moreButton.props.onClick as (e: React.MouseEvent) => void)({
      stopPropagation,
    } as unknown as React.MouseEvent);
    expect(stopPropagation).toHaveBeenCalled();
    expect(onContextMenu).toHaveBeenCalled();
  });
});

describe('FolderRow — edit mode', () => {
  it('renders an input with amber border when editing', () => {
    const tree = render({ editingId: 'f-root', editingName: 'newName' });
    const inputs = findAll(tree, (el) => el.type === 'input');
    expect(inputs).toHaveLength(1);
    expect(classOf(inputs[0])).toContain('border-amber-500/50');
    expect(inputs[0].props.value).toBe('newName');
  });

  it('header.draggable=false while editing', () => {
    const tree = render({ editingId: 'f-root' });
    const header = getHeaderRow(tree);
    expect(header.props.draggable).toBe(false);
  });

  it('hides the item count and More button while editing', () => {
    const tree = render({ editingId: 'f-root' });
    const badges = findAll(tree, (el) => classOf(el).includes('tabular-nums'));
    expect(badges).toHaveLength(0);
    const moreButtons = findAll(
      tree,
      (el) => el.type === 'button' && classOf(el).includes('opacity-0 group-hover:opacity-100'),
    );
    expect(moreButtons).toHaveLength(0);
  });

  it('input.onKeyDown Enter calls onFinishRename', () => {
    const onFinishRename = vi.fn();
    const tree = render({ editingId: 'f-root', onFinishRename });
    const input = findAll(tree, (el) => el.type === 'input')[0];
    (input.props.onKeyDown as (e: React.KeyboardEvent) => void)({ key: 'Enter' } as React.KeyboardEvent);
    expect(onFinishRename).toHaveBeenCalledTimes(1);
  });

  it('input.onKeyDown Escape clears editingId and editingName', () => {
    const setEditingId = vi.fn();
    const setEditingName = vi.fn();
    const tree = render({ editingId: 'f-root', setEditingId, setEditingName });
    const input = findAll(tree, (el) => el.type === 'input')[0];
    (input.props.onKeyDown as (e: React.KeyboardEvent) => void)({ key: 'Escape' } as React.KeyboardEvent);
    expect(setEditingId).toHaveBeenCalledWith(null);
    expect(setEditingName).toHaveBeenCalledWith('');
  });

  it('input.onChange updates editingName', () => {
    const setEditingName = vi.fn();
    const tree = render({ editingId: 'f-root', setEditingName });
    const input = findAll(tree, (el) => el.type === 'input')[0];
    (input.props.onChange as (e: React.ChangeEvent<HTMLInputElement>) => void)({
      target: { value: 'X' },
    } as unknown as React.ChangeEvent<HTMLInputElement>);
    expect(setEditingName).toHaveBeenCalledWith('X');
  });

  it('input.onBlur calls onFinishRename', () => {
    const onFinishRename = vi.fn();
    const tree = render({ editingId: 'f-root', onFinishRename });
    const input = findAll(tree, (el) => el.type === 'input')[0];
    (input.props.onBlur as () => void)();
    expect(onFinishRename).toHaveBeenCalled();
  });

  it('input.onClick stops propagation', () => {
    const tree = render({ editingId: 'f-root' });
    const input = findAll(tree, (el) => el.type === 'input')[0];
    const stopPropagation = vi.fn();
    (input.props.onClick as (e: React.MouseEvent) => void)({
      stopPropagation,
    } as unknown as React.MouseEvent);
    expect(stopPropagation).toHaveBeenCalled();
  });
});

describe('FolderRow — children + recursion', () => {
  it('does NOT render children when folder.expanded === false', () => {
    const tree = render({ folder: { ...FOLDER_ROOT, expanded: false } });
    const nested = findAll(tree, (el) => el.type === FolderRow);
    expect(nested).toHaveLength(0);
  });

  it('renders nested FolderRow for each child folder when expanded', () => {
    const tree = render();
    const nested = findAll(tree, (el) => el.type === FolderRow);
    // f-nested is the only child folder of f-root
    expect(nested).toHaveLength(1);
    expect(nested[0].props.folder.id).toBe('f-nested');
  });

  it('child folders get depth+1', () => {
    const tree = render({ depth: 2 });
    const nested = findAll(tree, (el) => el.type === FolderRow);
    expect(nested[0].props.depth).toBe(3);
  });

  it('invokes renderProject for each child project when expanded', () => {
    renderProjectMock.mockClear();
    render();
    expect(renderProjectMock).toHaveBeenCalledTimes(2);
    expect(renderProjectMock.mock.calls[0][0].id).toBe('p-A');
    expect(renderProjectMock.mock.calls[1][0].id).toBe('p-B');
  });

  it('child projects get depth+1', () => {
    renderProjectMock.mockClear();
    render({ depth: 1 });
    expect(renderProjectMock.mock.calls[0][1]).toBe(2);
  });

  it('sorts children by order', () => {
    renderProjectMock.mockClear();
    const out_of_order_projects = [
      { ...PROJECT_A, id: 'p-A', order: 5 },
      { ...PROJECT_A, id: 'p-B', order: 1 },
      { ...PROJECT_A, id: 'p-C', order: 3 },
    ];
    render({ projects: out_of_order_projects });
    expect(renderProjectMock.mock.calls.map((c) => c[0].id)).toEqual(['p-B', 'p-C', 'p-A']);
  });

  it('does not render projects from a different folder', () => {
    renderProjectMock.mockClear();
    const other_project: Project = { ...PROJECT_A, id: 'p-other', folderId: 'other-folder' };
    render({ projects: [PROJECT_A, other_project] });
    expect(renderProjectMock).toHaveBeenCalledTimes(1);
    expect(renderProjectMock.mock.calls[0][0].id).toBe('p-A');
  });
});
