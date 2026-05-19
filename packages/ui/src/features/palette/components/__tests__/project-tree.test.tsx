/**
 * rf-ptree-8 — `ProjectTree` orchestrator smoke tests.
 *
 * The bulk of project-tree behavior lives in five extracted modules:
 *   - utils/drag-encoding (rf-ptree-1)
 *   - hooks/use-tree-handlers (rf-ptree-2)
 *   - hooks/use-tree-drag (rf-ptree-3)
 *   - hooks/use-tree-effects (rf-ptree-4)
 *   - components/{environment-row,project-row,folder-row,tree-context-menu}
 *     (rf-ptree-5..8)
 *
 * The orchestrator is now a thin layout: it owns the five useState slots,
 * plumbs the hook outputs into a renderProject/renderFolder thunk, and
 * lays out the Header / Tree / Empty-state / ContextMenu sections. These
 * smoke tests exercise the surface that's unique to the orchestrator —
 * the render path that NO extracted module covers — using a real Redux
 * store + Provider + renderToString.
 */

import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Provider } from 'react-redux';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock useEffect to no-op (we don't want side-effects firing during smoke render)
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: vi.fn(),
  };
});

// Mock the i18n hook
vi.mock('../../../../i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import cardsReducer from '../../../../store/slices/cards-slice';
import deployReducer from '../../../../store/slices/deploy-slice';
import projectsReducer from '../../../../store/slices/projects-slice';
import uiReducer from '../../../../store/slices/ui-slice';
import { ProjectTree } from '../project-tree';

interface StoreInputs {
  projects?: Parameters<typeof projectsReducer>[1];
  ui?: Parameters<typeof uiReducer>[1];
}

type AnyAction = { type: string; payload?: unknown };

const makeStore = () =>
  configureStore({
    reducer: {
      projects: projectsReducer,
      deploy: deployReducer,
      ui: uiReducer,
      cards: cardsReducer,
      // The orchestrator reads `state.account?.selectedOrg` — supply a stub
      // reducer that returns a fixed shape.
      account: (s = { selectedOrg: { id: 'org-1' } }) => s,
    } as Parameters<typeof configureStore>[0]['reducer'],
  });

beforeEach(() => {
  vi.clearAllMocks();
});

const renderTree = (store: ReturnType<typeof makeStore> = makeStore()): string =>
  renderToString(
    <Provider store={store}>
      <ProjectTree />
    </Provider>,
  );

describe('ProjectTree — header section', () => {
  it('renders the New Project button', () => {
    const html = renderTree();
    expect(html).toContain('projectTree.newProject');
  });

  it('renders the New Folder button', () => {
    const html = renderTree();
    expect(html).toContain('projectTree.newFolder');
  });
});

describe('ProjectTree — empty state', () => {
  it('renders the empty hint when there are no projects/folders', () => {
    const html = renderTree();
    expect(html).toContain('projectTree.emptyNoProjects');
    expect(html).toContain('projectTree.emptyHint');
  });
});

describe('ProjectTree — populated state', () => {
  it('renders project name when a project is in the store', () => {
    const store = makeStore();
    // Hydrate via the fetchProjectTree.fulfilled action shape.
    store.dispatch({
      type: 'projects/fetchProjectTree/fulfilled',
      payload: {
        orgId: 'org-1',
        projects: [
          {
            id: 'p1',
            name: 'My Project',
            description: '',
            provider: 'gcp',
            organisationId: 'org-1',
            environments: [],
            folderId: null,
            order: 0,
            expanded: false,
            createdAt: 0,
          },
        ],
        folders: [],
      },
    } as AnyAction);
    const html = renderTree(store);
    expect(html).not.toContain('projectTree.emptyNoProjects');
    expect(html).toContain('My Project');
  });

  it('renders folder name when a folder is in the store', () => {
    const store = makeStore();
    store.dispatch({
      type: 'projects/fetchProjectTree/fulfilled',
      payload: {
        orgId: 'org-1',
        projects: [],
        folders: [
          {
            id: 'f1',
            name: 'My Folder',
            organisationId: 'org-1',
            parentFolderId: null,
            expanded: true,
            order: 0,
          },
        ],
      },
    } as AnyAction);
    const html = renderTree(store);
    expect(html).not.toContain('projectTree.emptyNoProjects');
    expect(html).toContain('My Folder');
  });
});

describe('ProjectTree — does not crash on edge inputs', () => {
  it('renders without a selectedOrg (orgId fallback to empty string)', () => {
    const store = configureStore({
      reducer: {
        projects: projectsReducer,
        deploy: deployReducer,
        ui: uiReducer,
        cards: cardsReducer,
        account: (s = { selectedOrg: null }) => s,
      } as Parameters<typeof configureStore>[0]['reducer'],
    });
    expect(() => renderTree(store)).not.toThrow();
  });
});
