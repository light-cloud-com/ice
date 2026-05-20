/**
 * Thunk-body coverage for projects-slice.
 *
 * `fetchProjectTree` is the only thunk; it dynamically imports
 * axios-instance and POSTs to /canvas/projects. We mock the module via
 * `vi.mock` so the thunk runs end-to-end against an in-memory store.
 */

import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const postSpy = vi.fn();

vi.mock('../../../shared/api/axios-instance', () => ({
  default: {
    post: postSpy,
  },
}));

import projectsReducer, { fetchProjectTree } from '../projects-slice';

function makeStore() {
  return configureStore({
    reducer: { projects: projectsReducer },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}

beforeEach(() => {
  postSpy.mockReset();
});

describe('projects-slice fetchProjectTree thunk', () => {
  it('translates folder + project items, including environments', async () => {
    postSpy.mockResolvedValue({
      data: [
        {
          id: 'f-1',
          name: 'Folder A',
          type: 'folder',
          parent_id: null,
          organisation_id: 'org-1',
        },
        {
          id: 'p-1',
          name: 'Project P',
          description: 'desc',
          type: 'project',
          parent_id: 'f-1',
          organisation_id: 'org-1',
          provider: 'gcp',
          created_at: '2026-01-01T00:00:00Z',
          environments: [
            {
              id: 'e-1',
              name: 'prod',
              type: 'production',
              card_id: 'card-1',
              region: 'us-central1',
            },
            {
              id: 'e-2',
              name: 'staging',
              type: 'staging',
              card_id: 'card-2',
            },
          ],
        },
      ],
    });
    const store = makeStore();
    const action = await store.dispatch(fetchProjectTree('org-1'));
    expect(action.type).toBe(fetchProjectTree.fulfilled.type);
    const state = store.getState().projects;
    expect(state.folders).toHaveLength(1);
    expect(state.folders[0].id).toBe('f-1');
    expect(state.projects).toHaveLength(1);
    expect(state.projects[0].id).toBe('p-1');
    expect(state.projects[0].environments).toHaveLength(2);
    expect(state.projects[0].environments[0].region).toBe('us-central1');
    // env-2 has no region → falls back to ''.
    expect(state.projects[0].environments[1].region).toBe('');
  });

  it('handles a project with no environments + no description + no provider + no created_at', async () => {
    postSpy.mockResolvedValue({
      data: [
        {
          id: 'p-bare',
          name: 'Bare',
          type: 'project',
          parent_id: null,
          organisation_id: 'org-1',
        },
      ],
    });
    const store = makeStore();
    await store.dispatch(fetchProjectTree('org-1'));
    const proj = store.getState().projects.projects[0];
    expect(proj.description).toBe('');
    expect(proj.provider).toBe('');
    expect(proj.environments).toEqual([]);
    expect(proj.createdAt).toBe(0);
  });

  it('handles environment with missing type → defaults to development', async () => {
    postSpy.mockResolvedValue({
      data: [
        {
          id: 'p-1',
          name: 'P',
          type: 'project',
          parent_id: null,
          organisation_id: 'org-1',
          environments: [{ id: 'e-1', name: 'env', card_id: 'c-1' }],
        },
      ],
    });
    const store = makeStore();
    await store.dispatch(fetchProjectTree('org-1'));
    const env = store.getState().projects.projects[0].environments[0];
    expect(env.type).toBe('development');
  });

  it('rejects when axios.post throws', async () => {
    postSpy.mockRejectedValue(new Error('500'));
    const store = makeStore();
    const action = await store.dispatch(fetchProjectTree('org-1'));
    expect(action.type).toBe(fetchProjectTree.rejected.type);
    expect(store.getState().projects.loading).toBe(false);
  });
});
