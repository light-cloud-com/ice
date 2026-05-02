/**
 * Reducer tests for environments-slice.
 *
 * `setActiveEnvironment` writes the env id without validation — mirrors the
 * loose shape of `projects-slice.setActiveProject`. The fetchEnvironments
 * fulfilled-handler auto-picks production as active when none is set.
 *
 * Async thunk bodies (calls into `getApi().environments.*`) are covered in
 * `environments-slice-thunks.test.ts`. Here we drive the lifecycle reducers
 * directly via `<thunk>.pending|fulfilled|rejected(...)` action creators.
 */

import { describe, it, expect } from 'vitest';
import environmentsReducer, {
  setActiveEnvironment,
  clearPendingDiff,
  fetchEnvironments,
  createEnvironment,
  deleteEnvironment,
  renameEnvironment,
  compareEnvironments,
  promoteEnvironment,
  type EnvironmentsState,
  type Environment,
  type EnvironmentDiff,
} from '../environments-slice';

function init(): EnvironmentsState {
  return environmentsReducer(undefined, { type: '@@INIT' });
}

function env(overrides: Partial<Environment> = {}): Environment {
  return {
    id: 'env-1',
    project_id: 'p-1',
    card_id: 'c-1',
    name: 'production',
    type: 'production',
    region: 'us-central1',
    is_protected: true,
    pr_number: null,
    pr_branch: null,
    ...overrides,
  };
}

function diff(): EnvironmentDiff {
  return { added: [], removed: [], modified: [], unchangedCount: 0 };
}

describe('environments-slice', () => {
  it('seeds the initial state', () => {
    const s = init();
    expect(s.byProject).toEqual({});
    expect(s.activeEnvId).toEqual({});
    expect(s.loading).toBe(false);
    expect(s.pendingDiff).toBeNull();
    expect(s.pendingPromote).toBeNull();
    expect(s.promoting).toBe(false);
  });

  describe('setActiveEnvironment', () => {
    it('writes activeEnvId[projectId] without validating env existence', () => {
      // Distinguishes from projects-slice.setActiveEnvironment which DOES
      // validate the project containing the env. setActiveEnvironment here
      // is intentionally loose — see "wave 5A bug-shape" in CLAUDE.md.
      const s = environmentsReducer(
        init(),
        setActiveEnvironment({ projectId: 'p-1', envId: 'never-fetched' }),
      );
      expect(s.activeEnvId['p-1']).toBe('never-fetched');
    });
  });

  describe('clearPendingDiff', () => {
    it('clears both diff and pending promote in one action', () => {
      // Drive a fulfilled compare to populate the pending pair, then clear.
      let s = environmentsReducer(
        init(),
        compareEnvironments.fulfilled(
          { diff: diff(), sourceEnvId: 'env-a', targetEnvId: 'env-b' },
          'r-1',
          { sourceEnvId: 'env-a', targetEnvId: 'env-b' },
        ),
      );
      expect(s.pendingDiff).not.toBeNull();
      expect(s.pendingPromote).not.toBeNull();
      s = environmentsReducer(s, clearPendingDiff());
      expect(s.pendingDiff).toBeNull();
      expect(s.pendingPromote).toBeNull();
    });
  });

  describe('fetchEnvironments lifecycle', () => {
    it('flips loading on pending', () => {
      const s = environmentsReducer(init(), fetchEnvironments.pending('r-1', 'p-1'));
      expect(s.loading).toBe(true);
    });

    it('stores envs and auto-picks production as active when none set', () => {
      const s = environmentsReducer(
        init(),
        fetchEnvironments.fulfilled(
          { projectId: 'p-1', environments: [env({ id: 'env-prod', type: 'production' }), env({ id: 'env-stg', type: 'staging' })] },
          'r-1',
          'p-1',
        ),
      );
      expect(s.loading).toBe(false);
      expect(s.byProject['p-1']).toHaveLength(2);
      expect(s.activeEnvId['p-1']).toBe('env-prod');
    });

    it('keeps existing active env intact across re-fetches', () => {
      // First fetch sets active to env-prod.
      let s = environmentsReducer(
        init(),
        fetchEnvironments.fulfilled(
          { projectId: 'p-1', environments: [env({ id: 'env-prod', type: 'production' })] },
          'r-1',
          'p-1',
        ),
      );
      // User explicitly picks staging.
      s = environmentsReducer(s, setActiveEnvironment({ projectId: 'p-1', envId: 'env-stg' }));
      // Re-fetch with both envs — active stays env-stg.
      s = environmentsReducer(
        s,
        fetchEnvironments.fulfilled(
          {
            projectId: 'p-1',
            environments: [
              env({ id: 'env-prod', type: 'production' }),
              env({ id: 'env-stg', type: 'staging' }),
            ],
          },
          'r-2',
          'p-1',
        ),
      );
      expect(s.activeEnvId['p-1']).toBe('env-stg');
    });

    it('does not auto-pick when there is no production env', () => {
      const s = environmentsReducer(
        init(),
        fetchEnvironments.fulfilled(
          { projectId: 'p-1', environments: [env({ id: 'env-stg', type: 'staging' })] },
          'r-1',
          'p-1',
        ),
      );
      expect(s.activeEnvId['p-1']).toBeUndefined();
    });

    it('clears loading on rejected', () => {
      let s = environmentsReducer(init(), fetchEnvironments.pending('r-1', 'p-1'));
      s = environmentsReducer(s, fetchEnvironments.rejected(null, 'r-1', 'p-1'));
      expect(s.loading).toBe(false);
    });
  });

  describe('createEnvironment.fulfilled', () => {
    it('appends to an existing project bucket', () => {
      let s = environmentsReducer(
        init(),
        fetchEnvironments.fulfilled(
          { projectId: 'p-1', environments: [env({ id: 'env-prod', type: 'production' })] },
          'r-1',
          'p-1',
        ),
      );
      s = environmentsReducer(
        s,
        createEnvironment.fulfilled(
          { projectId: 'p-1', environment: env({ id: 'env-stg', type: 'staging' }) },
          'r-2',
          { projectId: 'p-1', name: 'staging', type: 'staging' },
        ),
      );
      expect(s.byProject['p-1']).toHaveLength(2);
    });

    it('creates the bucket for a previously-unknown project', () => {
      const s = environmentsReducer(
        init(),
        createEnvironment.fulfilled(
          { projectId: 'p-new', environment: env({ id: 'env-new' }) },
          'r-1',
          { projectId: 'p-new', name: 'env-new', type: 'production' },
        ),
      );
      expect(s.byProject['p-new']).toHaveLength(1);
    });
  });

  describe('deleteEnvironment.fulfilled', () => {
    function seeded() {
      return environmentsReducer(
        init(),
        fetchEnvironments.fulfilled(
          {
            projectId: 'p-1',
            environments: [
              env({ id: 'env-prod', type: 'production' }),
              env({ id: 'env-stg', type: 'staging' }),
            ],
          },
          'r-1',
          'p-1',
        ),
      );
    }

    it('removes the env from the project bucket', () => {
      let s = seeded();
      s = environmentsReducer(
        s,
        deleteEnvironment.fulfilled(
          { envId: 'env-stg', projectId: 'p-1' },
          'r-2',
          { envId: 'env-stg', projectId: 'p-1' },
        ),
      );
      expect(s.byProject['p-1']).toHaveLength(1);
      expect(s.byProject['p-1'][0].id).toBe('env-prod');
    });

    it('re-points active to production when the active env is deleted', () => {
      let s = seeded();
      s = environmentsReducer(s, setActiveEnvironment({ projectId: 'p-1', envId: 'env-stg' }));
      s = environmentsReducer(
        s,
        deleteEnvironment.fulfilled(
          { envId: 'env-stg', projectId: 'p-1' },
          'r-2',
          { envId: 'env-stg', projectId: 'p-1' },
        ),
      );
      expect(s.activeEnvId['p-1']).toBe('env-prod');
    });

    it('falls back to empty string when no production env remains after delete', () => {
      // Project with only staging. Active is staging. Delete it.
      let s = environmentsReducer(
        init(),
        fetchEnvironments.fulfilled(
          { projectId: 'p-1', environments: [env({ id: 'env-stg', type: 'staging' })] },
          'r-1',
          'p-1',
        ),
      );
      s = environmentsReducer(s, setActiveEnvironment({ projectId: 'p-1', envId: 'env-stg' }));
      s = environmentsReducer(
        s,
        deleteEnvironment.fulfilled(
          { envId: 'env-stg', projectId: 'p-1' },
          'r-2',
          { envId: 'env-stg', projectId: 'p-1' },
        ),
      );
      expect(s.activeEnvId['p-1']).toBe('');
    });

    it('is a no-op when project bucket does not exist', () => {
      const s = environmentsReducer(
        init(),
        deleteEnvironment.fulfilled(
          { envId: 'env-x', projectId: 'p-unknown' },
          'r-1',
          { envId: 'env-x', projectId: 'p-unknown' },
        ),
      );
      expect(s.byProject).toEqual({});
    });

    it('keeps active untouched when an inactive env is deleted', () => {
      let s = seeded();
      s = environmentsReducer(s, setActiveEnvironment({ projectId: 'p-1', envId: 'env-prod' }));
      s = environmentsReducer(
        s,
        deleteEnvironment.fulfilled(
          { envId: 'env-stg', projectId: 'p-1' },
          'r-2',
          { envId: 'env-stg', projectId: 'p-1' },
        ),
      );
      expect(s.activeEnvId['p-1']).toBe('env-prod');
    });
  });

  describe('renameEnvironment.fulfilled', () => {
    it('renames in place', () => {
      let s = environmentsReducer(
        init(),
        fetchEnvironments.fulfilled(
          { projectId: 'p-1', environments: [env({ id: 'env-1' })] },
          'r-1',
          'p-1',
        ),
      );
      s = environmentsReducer(
        s,
        renameEnvironment.fulfilled(
          { envId: 'env-1', projectId: 'p-1', name: 'renamed' },
          'r-2',
          { envId: 'env-1', projectId: 'p-1', name: 'renamed' },
        ),
      );
      expect(s.byProject['p-1'][0].name).toBe('renamed');
    });

    it('is a no-op when env id is unknown', () => {
      let s = environmentsReducer(
        init(),
        fetchEnvironments.fulfilled(
          { projectId: 'p-1', environments: [env({ id: 'env-1', name: 'original' })] },
          'r-1',
          'p-1',
        ),
      );
      s = environmentsReducer(
        s,
        renameEnvironment.fulfilled(
          { envId: 'env-ghost', projectId: 'p-1', name: 'never' },
          'r-2',
          { envId: 'env-ghost', projectId: 'p-1', name: 'never' },
        ),
      );
      expect(s.byProject['p-1'][0].name).toBe('original');
    });

    it('is a no-op when project bucket does not exist', () => {
      const s = environmentsReducer(
        init(),
        renameEnvironment.fulfilled(
          { envId: 'env-1', projectId: 'p-ghost', name: 'never' },
          'r-1',
          { envId: 'env-1', projectId: 'p-ghost', name: 'never' },
        ),
      );
      expect(s.byProject).toEqual({});
    });
  });

  describe('compareEnvironments.fulfilled', () => {
    it('stores diff + pending promote pair', () => {
      const d = diff();
      const s = environmentsReducer(
        init(),
        compareEnvironments.fulfilled(
          { diff: d, sourceEnvId: 'env-a', targetEnvId: 'env-b' },
          'r-1',
          { sourceEnvId: 'env-a', targetEnvId: 'env-b' },
        ),
      );
      expect(s.pendingDiff).toBe(d);
      expect(s.pendingPromote).toEqual({ sourceEnvId: 'env-a', targetEnvId: 'env-b' });
    });
  });

  describe('promoteEnvironment lifecycle', () => {
    it('flips promoting on pending', () => {
      const s = environmentsReducer(
        init(),
        promoteEnvironment.pending('r-1', { sourceEnvId: 'env-a', targetEnvId: 'env-b' }),
      );
      expect(s.promoting).toBe(true);
    });

    it('clears promoting + diff + pending pair on fulfilled', () => {
      let s = environmentsReducer(
        init(),
        compareEnvironments.fulfilled(
          { diff: diff(), sourceEnvId: 'a', targetEnvId: 'b' },
          'r-1',
          { sourceEnvId: 'a', targetEnvId: 'b' },
        ),
      );
      s = environmentsReducer(
        s,
        promoteEnvironment.pending('r-2', { sourceEnvId: 'a', targetEnvId: 'b' }),
      );
      s = environmentsReducer(
        s,
        promoteEnvironment.fulfilled(undefined as any, 'r-2', { sourceEnvId: 'a', targetEnvId: 'b' }),
      );
      expect(s.promoting).toBe(false);
      expect(s.pendingDiff).toBeNull();
      expect(s.pendingPromote).toBeNull();
    });

    it('clears promoting on rejected without disturbing pending diff', () => {
      let s = environmentsReducer(
        init(),
        compareEnvironments.fulfilled(
          { diff: diff(), sourceEnvId: 'a', targetEnvId: 'b' },
          'r-1',
          { sourceEnvId: 'a', targetEnvId: 'b' },
        ),
      );
      s = environmentsReducer(
        s,
        promoteEnvironment.pending('r-2', { sourceEnvId: 'a', targetEnvId: 'b' }),
      );
      s = environmentsReducer(
        s,
        promoteEnvironment.rejected(null, 'r-2', { sourceEnvId: 'a', targetEnvId: 'b' }),
      );
      expect(s.promoting).toBe(false);
      // Pending diff is preserved so the user can retry the promote.
      expect(s.pendingDiff).not.toBeNull();
      expect(s.pendingPromote).not.toBeNull();
    });
  });
});
