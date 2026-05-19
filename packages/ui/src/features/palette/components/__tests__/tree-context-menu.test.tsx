/**
 * rf-ptree-8 — `TreeContextMenu` component.
 *
 * Direct-FC tree-walker pattern. Tests pin:
 *   - The four button branches (Rename always, Move-to-Top-Level by isNested,
 *     New Subfolder when type === 'folder', Delete always),
 *   - The `setContextMenu(null)` ordering inside Move-to-Top-Level (must
 *     fire BEFORE the dispatch), and inside New Subfolder (must fire
 *     before setCreatingFolder),
 *   - The position styling via the `left`/`top` style props,
 *   - The menuRef threading.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { TreeContextMenu, type TreeContextMenuProps } from '../tree-context-menu';
import type { Project, ProjectFolder } from '../../../../store/slices/projects-slice';

const PROJECT_ROOT: Project = {
  id: 'p-root',
  name: 'Root Project',
  description: '',
  provider: 'gcp',
  organisationId: 'org-1',
  environments: [],
  folderId: null, // top-level
  order: 0,
  expanded: false,
  createdAt: 0,
};
const PROJECT_NESTED: Project = { ...PROJECT_ROOT, id: 'p-nested', folderId: 'f-parent' };
const FOLDER_ROOT: ProjectFolder = {
  id: 'f-root',
  name: 'Root Folder',
  organisationId: 'org-1',
  parentFolderId: null, // top-level
  expanded: false,
  order: 0,
};
const FOLDER_NESTED: ProjectFolder = { ...FOLDER_ROOT, id: 'f-nested', parentFolderId: 'f-parent' };

type Fn = (p: TreeContextMenuProps) => React.ReactElement;

const baseProps = (overrides: Partial<TreeContextMenuProps> = {}): TreeContextMenuProps => ({
  contextMenu: { x: 100, y: 200, type: 'project', id: 'p-root' },
  projects: [PROJECT_ROOT, PROJECT_NESTED],
  folders: [FOLDER_ROOT, FOLDER_NESTED],
  menuRef: { current: null } as React.RefObject<HTMLDivElement>,
  dispatch: vi.fn() as unknown as TreeContextMenuProps['dispatch'],
  t: ((k: string) => k) as TreeContextMenuProps['t'],
  onStartRename: vi.fn(),
  onDelete: vi.fn(),
  setContextMenu: vi.fn(),
  setCreatingFolder: vi.fn(),
  setNewFolderName: vi.fn(),
  ...overrides,
});

const render = (overrides: Partial<TreeContextMenuProps> = {}): React.ReactElement =>
  (TreeContextMenu as unknown as Fn)(baseProps(overrides));

function findAll(el: unknown, pred: (e: React.ReactElement) => boolean): React.ReactElement[] {
  if (el == null || typeof el !== 'object') return [];
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

const buttons = (tree: React.ReactElement): React.ReactElement[] => findAll(tree, (el) => el.type === 'button');

// ────────────────────────────────────────────────────────────────────────────

describe('TreeContextMenu — positioning + ref', () => {
  it('positions via style.left/top from contextMenu coords', () => {
    const tree = render({ contextMenu: { x: 50, y: 80, type: 'project', id: 'p-root' } });
    const style = tree.props.style as React.CSSProperties;
    expect(style.left).toBe(50);
    expect(style.top).toBe(80);
  });

  it('attaches menuRef to the wrapping div', () => {
    const ref = { current: null } as React.RefObject<HTMLDivElement>;
    const tree = render({ menuRef: ref });
    // React stores refs as a top-level slot (`el.ref` for legacy compat) or
    // via the `ref` prop in newer JSX runtimes — check both.
    const legacyRef = (tree as unknown as { ref?: unknown }).ref;
    const propsRef = (tree.props as unknown as { ref?: unknown }).ref;
    expect(legacyRef === ref || propsRef === ref).toBe(true);
  });
});

describe('TreeContextMenu — Rename action', () => {
  it('always renders the Rename button', () => {
    const tree = render();
    const txt = collectText(tree);
    expect(txt).toContain('projectTree.contextRename');
  });

  it('clicking Rename calls onStartRename(type, id)', () => {
    const onStartRename = vi.fn();
    const tree = render({
      contextMenu: { x: 0, y: 0, type: 'folder', id: 'f-X' },
      onStartRename,
    });
    const btns = buttons(tree);
    // Rename is the first button.
    (btns[0].props.onClick as () => void)();
    expect(onStartRename).toHaveBeenCalledWith('folder', 'f-X');
  });
});

describe('TreeContextMenu — Move to Top Level', () => {
  it('does NOT render Move-to-Top-Level for a top-level project', () => {
    const tree = render({
      contextMenu: { x: 0, y: 0, type: 'project', id: 'p-root' },
    });
    expect(collectText(tree)).not.toContain('projectTree.contextMoveToTopLevel');
  });

  it('renders Move-to-Top-Level for a nested project', () => {
    const tree = render({
      contextMenu: { x: 0, y: 0, type: 'project', id: 'p-nested' },
    });
    expect(collectText(tree)).toContain('projectTree.contextMoveToTopLevel');
  });

  it('clicking Move-to-Top-Level on a project: setContextMenu(null) + dispatch(moveProjectToFolder)', () => {
    const setContextMenu = vi.fn();
    const dispatch = vi.fn();
    const tree = render({
      contextMenu: { x: 0, y: 0, type: 'project', id: 'p-nested' },
      setContextMenu,
      dispatch: dispatch as unknown as TreeContextMenuProps['dispatch'],
    });
    const btns = buttons(tree);
    // Order: Rename, Move-to-Top-Level, Delete
    const moveBtn = btns.find((b) => collectText(b).includes('projectTree.contextMoveToTopLevel'));
    expect(moveBtn).toBeDefined();
    (moveBtn!.props.onClick as () => void)();
    expect(setContextMenu).toHaveBeenCalledWith(null);
    expect(dispatch).toHaveBeenCalled();
    const action = dispatch.mock.calls[0][0] as { type: string; payload: { projectId: string; folderId: null } };
    expect(action.type).toBe('projects/moveProjectToFolder');
    expect(action.payload).toEqual({ projectId: 'p-nested', folderId: null });
  });

  it('clicking Move-to-Top-Level on a folder: setContextMenu(null) + dispatch(moveFolder)', () => {
    const setContextMenu = vi.fn();
    const dispatch = vi.fn();
    const tree = render({
      contextMenu: { x: 0, y: 0, type: 'folder', id: 'f-nested' },
      setContextMenu,
      dispatch: dispatch as unknown as TreeContextMenuProps['dispatch'],
    });
    const moveBtn = buttons(tree).find((b) => collectText(b).includes('projectTree.contextMoveToTopLevel'));
    expect(moveBtn).toBeDefined();
    (moveBtn!.props.onClick as () => void)();
    expect(setContextMenu).toHaveBeenCalledWith(null);
    const action = dispatch.mock.calls[0][0] as { type: string; payload: { folderId: string; parentFolderId: null } };
    expect(action.type).toBe('projects/moveFolder');
    expect(action.payload).toEqual({ folderId: 'f-nested', parentFolderId: null });
  });

  it('does NOT render Move-to-Top-Level for a top-level folder', () => {
    const tree = render({
      contextMenu: { x: 0, y: 0, type: 'folder', id: 'f-root' },
    });
    expect(collectText(tree)).not.toContain('projectTree.contextMoveToTopLevel');
  });
});

describe('TreeContextMenu — New Subfolder', () => {
  it('does NOT render New Subfolder when type === "project"', () => {
    const tree = render({
      contextMenu: { x: 0, y: 0, type: 'project', id: 'p-root' },
    });
    expect(collectText(tree)).not.toContain('projectTree.contextNewSubfolder');
  });

  it('renders New Subfolder when type === "folder"', () => {
    const tree = render({
      contextMenu: { x: 0, y: 0, type: 'folder', id: 'f-root' },
    });
    expect(collectText(tree)).toContain('projectTree.contextNewSubfolder');
  });

  it('clicking New Subfolder: setContextMenu(null) + setCreatingFolder(id) + setNewFolderName(t(default))', () => {
    const setContextMenu = vi.fn();
    const setCreatingFolder = vi.fn();
    const setNewFolderName = vi.fn();
    const t = vi.fn((k: string) => `T(${k})`);
    const tree = render({
      contextMenu: { x: 0, y: 0, type: 'folder', id: 'f-root' },
      setContextMenu,
      setCreatingFolder,
      setNewFolderName,
      t: t as unknown as TreeContextMenuProps['t'],
    });
    const subBtn = buttons(tree).find((b) => collectText(b).includes('projectTree.contextNewSubfolder'));
    (subBtn!.props.onClick as () => void)();
    expect(setContextMenu).toHaveBeenCalledWith(null);
    expect(setCreatingFolder).toHaveBeenCalledWith('f-root');
    expect(setNewFolderName).toHaveBeenCalledWith('T(projectTree.defaultFolderName)');
  });
});

describe('TreeContextMenu — Delete action', () => {
  it('always renders the Delete button', () => {
    const tree = render();
    expect(collectText(tree)).toContain('projectTree.contextDelete');
  });

  it('clicking Delete calls onDelete(type, id)', () => {
    const onDelete = vi.fn();
    const tree = render({
      contextMenu: { x: 0, y: 0, type: 'project', id: 'p-X' },
      onDelete,
    });
    const delBtn = buttons(tree).find((b) => collectText(b).includes('projectTree.contextDelete'));
    (delBtn!.props.onClick as () => void)();
    expect(onDelete).toHaveBeenCalledWith('project', 'p-X');
  });

  it('Delete is the LAST button (after the divider)', () => {
    const tree = render({ contextMenu: { x: 0, y: 0, type: 'folder', id: 'f-root' } });
    const btns = buttons(tree);
    const lastBtnText = collectText(btns[btns.length - 1]);
    expect(lastBtnText).toContain('projectTree.contextDelete');
  });
});

describe('TreeContextMenu — button counts by combination', () => {
  it('top-level project: 2 buttons (Rename, Delete)', () => {
    const tree = render({ contextMenu: { x: 0, y: 0, type: 'project', id: 'p-root' } });
    expect(buttons(tree)).toHaveLength(2);
  });

  it('nested project: 3 buttons (Rename, Move, Delete)', () => {
    const tree = render({ contextMenu: { x: 0, y: 0, type: 'project', id: 'p-nested' } });
    expect(buttons(tree)).toHaveLength(3);
  });

  it('top-level folder: 3 buttons (Rename, New Subfolder, Delete)', () => {
    const tree = render({ contextMenu: { x: 0, y: 0, type: 'folder', id: 'f-root' } });
    expect(buttons(tree)).toHaveLength(3);
  });

  it('nested folder: 4 buttons (Rename, Move, New Subfolder, Delete)', () => {
    const tree = render({ contextMenu: { x: 0, y: 0, type: 'folder', id: 'f-nested' } });
    expect(buttons(tree)).toHaveLength(4);
  });

  it('unknown id: same as top-level (find returns undefined → folderId/parentFolderId is undefined → != null is false)', () => {
    const tree = render({ contextMenu: { x: 0, y: 0, type: 'project', id: 'unknown' } });
    expect(buttons(tree)).toHaveLength(2); // Rename + Delete only
  });
});
