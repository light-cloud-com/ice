/**
 * rf-pbrws-3 — useProjectBrowserActions hook tests.
 *
 * Capture-ref pattern: render a Probe FC that calls the hook and stores
 * the result on a captured object, then post-render invoke the handlers
 * directly and assert axios + navigate calls.
 *
 * Mocks:
 *  - `axios-instance.default.post` — vi.fn so each test can flip
 *    resolved/rejected per-call.
 *  - `react-router-dom.useNavigate` — returns mocks.navigate.
 *  - `i18n.useTranslation` — returns `{ t: (k) => k }` so message keys are
 *    visible in assertions.
 *  - `window.confirm` — vi.fn; tests flip true/false.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  axiosPost: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('../../../../shared/api/axios-instance', () => ({
  default: { post: mocks.axiosPost },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { useProjectBrowserActions, type UseProjectBrowserActionsResult } from '../use-project-browser-actions';
import type { ProjectNode } from '../../types/project-node';

const makeNode = (overrides: Partial<ProjectNode> = {}): ProjectNode => ({
  id: 'n',
  name: 'N',
  type: 'project',
  parent_id: null,
  cards: [],
  children: [],
  ...overrides,
});

interface Captured {
  current?: UseProjectBrowserActionsResult;
}

const renderHook = (args: {
  items?: ProjectNode[];
  flatFolders?: ProjectNode[];
  fetchProjects?: () => Promise<void>;
  setExpanded?: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectedOrg?: { id: string; name: string };
}): Captured => {
  const captured: Captured = {};
  const Probe: React.FC = () => {
    captured.current = useProjectBrowserActions({
      items: args.items ?? [],
      flatFolders: args.flatFolders ?? [],
      fetchProjects: args.fetchProjects ?? vi.fn().mockResolvedValue(undefined),
      setExpanded: args.setExpanded ?? vi.fn(),
      selectedOrg: args.selectedOrg,
    });
    return null;
  };
  renderToString(React.createElement(Probe));
  return captured;
};

beforeEach(() => {
  mocks.axiosPost.mockReset();
  mocks.navigate.mockReset();
  mocks.axiosPost.mockResolvedValue({ data: {} });
});

describe('useProjectBrowserActions — handleCreate', () => {
  it('does nothing when no org is selected', async () => {
    const fetchProjects = vi.fn();
    const { current } = renderHook({ fetchProjects, selectedOrg: undefined });
    await current!.handleCreate('folder');
    expect(mocks.axiosPost).not.toHaveBeenCalled();
    expect(fetchProjects).not.toHaveBeenCalled();
  });

  it('creates a folder with the new-folder name key', async () => {
    const fetchProjects = vi.fn().mockResolvedValue(undefined);
    const { current } = renderHook({
      fetchProjects,
      selectedOrg: { id: 'o1', name: 'Org' },
    });
    await current!.handleCreate('folder');
    expect(mocks.axiosPost).toHaveBeenCalledWith('/canvas/projects/create', {
      name: 'projectBrowser.newFolderName',
      type: 'folder',
      parentId: null,
      organisationId: 'o1',
    });
    expect(fetchProjects).toHaveBeenCalled();
  });

  it('creates a project with the new-project name key when type is project', async () => {
    const { current } = renderHook({ selectedOrg: { id: 'o1', name: 'Org' } });
    await current!.handleCreate('project', 'parent-id');
    expect(mocks.axiosPost).toHaveBeenCalledWith('/canvas/projects/create', {
      name: 'projectBrowser.newProjectName',
      type: 'project',
      parentId: 'parent-id',
      organisationId: 'o1',
    });
  });

  it('auto-expands the parent folder when a child is created with parentId', async () => {
    const setExpanded = vi.fn();
    const { current } = renderHook({
      setExpanded,
      selectedOrg: { id: 'o1', name: 'Org' },
    });
    await current!.handleCreate('project', 'pid');
    expect(setExpanded).toHaveBeenCalled();
    // Inspect the updater function
    const updater = setExpanded.mock.calls[0][0];
    expect(updater(new Set<string>(['x']))).toEqual(new Set(['x', 'pid']));
  });

  it('does not call setExpanded when no parentId is given', async () => {
    const setExpanded = vi.fn();
    const { current } = renderHook({
      setExpanded,
      selectedOrg: { id: 'o1', name: 'Org' },
    });
    await current!.handleCreate('folder');
    expect(setExpanded).not.toHaveBeenCalled();
  });
});

describe('useProjectBrowserActions — handleRename', () => {
  it('posts the rename payload and refetches', async () => {
    const fetchProjects = vi.fn().mockResolvedValue(undefined);
    const { current } = renderHook({ fetchProjects });
    await current!.handleRename('id-1', 'new name');
    expect(mocks.axiosPost).toHaveBeenCalledWith('/canvas/projects/update', {
      projectId: 'id-1',
      name: 'new name',
    });
    expect(fetchProjects).toHaveBeenCalled();
  });
});

describe('useProjectBrowserActions — handleDelete', () => {
  // `window` doesn't exist in this monorepo's node-only vitest environment;
  // stub it via `vi.stubGlobal` (cite: existing pattern in
  // open-external-url.test.ts).

  it('returns early when window.confirm is rejected', async () => {
    vi.stubGlobal('window', { confirm: vi.fn(() => false) });
    const fetchProjects = vi.fn();
    const { current } = renderHook({ fetchProjects });
    await current!.handleDelete('id-1');
    expect(mocks.axiosPost).not.toHaveBeenCalled();
    expect(fetchProjects).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('posts the delete payload when confirm passes', async () => {
    vi.stubGlobal('window', { confirm: vi.fn(() => true) });
    const fetchProjects = vi.fn().mockResolvedValue(undefined);
    const { current } = renderHook({
      fetchProjects,
      selectedOrg: { id: 'o1', name: 'Org' },
    });
    await current!.handleDelete('id-1');
    expect(mocks.axiosPost).toHaveBeenCalledWith('/canvas/projects/delete', {
      projectId: 'id-1',
      organisationId: 'o1',
    });
    expect(fetchProjects).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('passes undefined organisationId when no org is selected', async () => {
    vi.stubGlobal('window', { confirm: vi.fn(() => true) });
    const { current } = renderHook({});
    await current!.handleDelete('id-1');
    expect(mocks.axiosPost).toHaveBeenCalledWith('/canvas/projects/delete', {
      projectId: 'id-1',
      organisationId: undefined,
    });
    vi.unstubAllGlobals();
  });
});

describe('useProjectBrowserActions — handleMove', () => {
  it('posts the move payload and refetches', async () => {
    const fetchProjects = vi.fn().mockResolvedValue(undefined);
    const { current } = renderHook({ fetchProjects });
    await current!.handleMove('id', 'parent');
    expect(mocks.axiosPost).toHaveBeenCalledWith('/canvas/projects/move', {
      projectId: 'id',
      parentId: 'parent',
    });
    expect(fetchProjects).toHaveBeenCalled();
  });

  it('handles null parent (move to root)', async () => {
    const { current } = renderHook({});
    await current!.handleMove('id', null);
    expect(mocks.axiosPost).toHaveBeenCalledWith('/canvas/projects/move', {
      projectId: 'id',
      parentId: null,
    });
  });
});

describe('useProjectBrowserActions — handleNavigateSubpage', () => {
  it('navigates to the bare path when subpage is canvas', () => {
    const root = makeNode({ id: 'r', name: 'Root', type: 'folder' });
    const { current } = renderHook({
      items: [root],
      selectedOrg: { id: 'o1', name: 'My Org' },
    });
    current!.handleNavigateSubpage(root, 'canvas');
    expect(mocks.navigate).toHaveBeenCalledWith('/my-org/root');
  });

  it('navigates to the suffixed path for non-canvas subpages', () => {
    const proj = makeNode({ id: 'p', name: 'Proj' });
    const { current } = renderHook({
      items: [proj],
      selectedOrg: { id: 'o1', name: 'Org' },
    });
    current!.handleNavigateSubpage(proj, 'logs');
    expect(mocks.navigate).toHaveBeenCalledWith('/org/proj/logs');
  });
});

describe('useProjectBrowserActions — handleOpen', () => {
  it('navigates to the project path', () => {
    const proj = makeNode({ id: 'p', name: 'Proj' });
    const { current } = renderHook({
      items: [proj],
      selectedOrg: { id: 'o1', name: 'Org' },
    });
    current!.handleOpen(proj);
    expect(mocks.navigate).toHaveBeenCalledWith('/org/proj');
  });

  it('uses flat folders to walk parent chain when project is nested', () => {
    const folder = makeNode({ id: 'f', name: 'Parent', type: 'folder' });
    const proj = makeNode({ id: 'p', name: 'Proj', parent_id: 'f' });
    const { current } = renderHook({
      items: [proj],
      flatFolders: [folder],
      selectedOrg: { id: 'o1', name: 'Org' },
    });
    current!.handleOpen(proj);
    expect(mocks.navigate).toHaveBeenCalledWith('/org/parent/proj');
  });
});
