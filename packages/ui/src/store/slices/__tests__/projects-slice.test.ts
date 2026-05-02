/**
 * Reducer + selector tests for projects-slice.
 *
 * Covers project + folder CRUD, active selection, the
 * fetchProjectTree thunk's pending/fulfilled/rejected matchers, and
 * every exported selector.
 */

import { describe, it, expect } from 'vitest';
import projectsReducer, {
  createProject,
  deleteProject,
  renameProject,
  moveProjectToFolder,
  toggleProjectExpanded,
  setActiveProject,
  setActiveEnvironment,
  createFolder,
  renameFolder,
  deleteFolder,
  toggleFolderExpanded,
  moveFolder,
  fetchProjectTree,
  selectActiveProjectId,
  selectActiveEnvironmentId,
  selectLoadedOrgId,
  selectProjectsByOrg,
  selectFoldersByOrg,
  type ProjectsState,
  type Project,
  type Environment,
  type ProjectFolder,
} from '../projects-slice';

function init(): ProjectsState {
  return projectsReducer(undefined, { type: '@@INIT' });
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p-1',
    name: 'Project 1',
    description: '',
    provider: 'gcp',
    organisationId: 'org-1',
    environments: [],
    folderId: null,
    order: 0,
    expanded: true,
    createdAt: 0,
    ...overrides,
  };
}

function env(overrides: Partial<Environment> = {}): Environment {
  return {
    id: 'env-1',
    name: 'prod',
    type: 'production',
    cardId: 'card-1',
    templateId: null,
    securityLevel: 'standard',
    region: 'us-central1',
    createdAt: 0,
    ...overrides,
  };
}

describe('projects-slice', () => {
  it('seeds initial state', () => {
    const s = init();
    expect(s.projects).toEqual([]);
    expect(s.folders).toEqual([]);
    expect(s.activeProjectId).toBeNull();
    expect(s.activeEnvironmentId).toBeNull();
    expect(s.loading).toBe(false);
    expect(s.loadedOrgId).toBeNull();
  });

  describe('createProject', () => {
    it('appends a project, marks it active, picks first env as active', () => {
      const s = projectsReducer(
        init(),
        createProject({
          id: 'p-1',
          name: 'P',
          description: '',
          provider: 'gcp',
          organisationId: 'org-1',
          environments: [env({ id: 'env-1' }), env({ id: 'env-2', name: 'staging' })],
          folderId: null,
        } as any),
      );
      expect(s.projects).toHaveLength(1);
      expect(s.projects[0].order).toBe(0);
      expect(s.projects[0].expanded).toBe(true);
      expect(s.activeProjectId).toBe('p-1');
      expect(s.activeEnvironmentId).toBe('env-1');
    });

    it('skips duplicates by id', () => {
      let s = projectsReducer(init(), createProject({ ...project(), environments: [] } as any));
      s = projectsReducer(s, createProject({ ...project(), environments: [] } as any));
      expect(s.projects).toHaveLength(1);
    });

    it('does not set activeEnvironmentId when project has no environments', () => {
      const s = projectsReducer(
        init(),
        createProject({
          id: 'p-1',
          name: 'P',
          description: '',
          provider: 'gcp',
          organisationId: 'org-1',
          environments: [],
          folderId: null,
        } as any),
      );
      expect(s.activeEnvironmentId).toBeNull();
    });

    it('orders new project after siblings in the same folder/org', () => {
      let s = init();
      s = projectsReducer(s, createProject({ ...project({ id: 'p-a' }), environments: [] } as any));
      s = projectsReducer(s, createProject({ ...project({ id: 'p-b' }), environments: [] } as any));
      const orderB = s.projects.find((p) => p.id === 'p-b')!.order;
      expect(orderB).toBe(1);
    });
  });

  describe('deleteProject', () => {
    it('removes the project and re-points active to the first remaining one', () => {
      let s = init();
      s = projectsReducer(
        s,
        createProject({
          ...project({ id: 'p-a' }),
          environments: [env({ id: 'env-a' })],
        } as any),
      );
      s = projectsReducer(
        s,
        createProject({
          ...project({ id: 'p-b' }),
          environments: [env({ id: 'env-b' })],
        } as any),
      );
      // Active is now p-b (most recent). Delete p-b.
      s = projectsReducer(s, deleteProject('p-b'));
      expect(s.projects.find((p) => p.id === 'p-b')).toBeUndefined();
      expect(s.activeProjectId).toBe('p-a');
      expect(s.activeEnvironmentId).toBe('env-a');
    });

    it('clears active to null when no projects remain', () => {
      let s = projectsReducer(init(), createProject({ ...project(), environments: [] } as any));
      s = projectsReducer(s, deleteProject('p-1'));
      expect(s.activeProjectId).toBeNull();
      expect(s.activeEnvironmentId).toBeNull();
    });

    it('keeps active intact when an inactive project is deleted', () => {
      let s = init();
      s = projectsReducer(
        s,
        createProject({ ...project({ id: 'p-a' }), environments: [env({ id: 'e-a' })] } as any),
      );
      s = projectsReducer(
        s,
        createProject({ ...project({ id: 'p-b' }), environments: [env({ id: 'e-b' })] } as any),
      );
      // Active is p-b. Delete p-a.
      s = projectsReducer(s, deleteProject('p-a'));
      expect(s.activeProjectId).toBe('p-b');
      expect(s.activeEnvironmentId).toBe('e-b');
    });

    it('is a no-op when the id does not exist', () => {
      const s = projectsReducer(init(), deleteProject('does-not-exist'));
      expect(s.projects).toEqual([]);
    });
  });

  describe('renameProject', () => {
    it('renames the project', () => {
      let s = projectsReducer(init(), createProject({ ...project(), environments: [] } as any));
      s = projectsReducer(s, renameProject({ projectId: 'p-1', name: 'New Name' }));
      expect(s.projects[0].name).toBe('New Name');
    });

    it('is a no-op for unknown id', () => {
      let s = projectsReducer(init(), createProject({ ...project(), environments: [] } as any));
      s = projectsReducer(s, renameProject({ projectId: 'nope', name: 'x' }));
      expect(s.projects[0].name).toBe('Project 1');
    });
  });

  describe('moveProjectToFolder', () => {
    it('updates folderId and recomputes order against new siblings', () => {
      let s = init();
      s = projectsReducer(s, createFolder({ name: 'F', organisationId: 'org-1' }));
      const folderId = s.folders[0].id;
      s = projectsReducer(s, createProject({ ...project({ id: 'p-a' }), environments: [] } as any));
      s = projectsReducer(s, createProject({ ...project({ id: 'p-b' }), environments: [] } as any));
      s = projectsReducer(s, moveProjectToFolder({ projectId: 'p-a', folderId }));
      const moved = s.projects.find((p) => p.id === 'p-a')!;
      expect(moved.folderId).toBe(folderId);
      expect(moved.order).toBe(0);
    });

    it('is a no-op for unknown id', () => {
      const s = projectsReducer(init(), moveProjectToFolder({ projectId: 'nope', folderId: 'f-1' }));
      expect(s.projects).toEqual([]);
    });
  });

  describe('toggleProjectExpanded', () => {
    it('flips expanded', () => {
      let s = projectsReducer(init(), createProject({ ...project(), environments: [] } as any));
      // After creation expanded is true.
      s = projectsReducer(s, toggleProjectExpanded('p-1'));
      expect(s.projects[0].expanded).toBe(false);
    });

    it('is a no-op for unknown id', () => {
      const s = projectsReducer(init(), toggleProjectExpanded('nope'));
      expect(s.projects).toEqual([]);
    });
  });

  describe('setActiveProject', () => {
    it('sets active and expands the project, defaulting env to first environment', () => {
      let s = init();
      s = projectsReducer(
        s,
        createProject({
          ...project({ id: 'p-a' }),
          environments: [env({ id: 'e-a-1' }), env({ id: 'e-a-2' })],
        } as any),
      );
      // After creation expanded=true. Collapse so we can verify expansion.
      s = projectsReducer(s, toggleProjectExpanded('p-a'));
      s = projectsReducer(s, setActiveProject('p-a'));
      expect(s.activeProjectId).toBe('p-a');
      expect(s.activeEnvironmentId).toBe('e-a-1');
      expect(s.projects[0].expanded).toBe(true);
    });

    it('clears activeEnvironmentId when project has no envs', () => {
      let s = projectsReducer(init(), createProject({ ...project(), environments: [] } as any));
      s = projectsReducer(s, setActiveProject('p-1'));
      expect(s.activeEnvironmentId).toBeNull();
    });

    it('still updates activeProjectId when the id does not exist (no validation)', () => {
      const s = projectsReducer(init(), setActiveProject('ghost'));
      expect(s.activeProjectId).toBe('ghost');
    });
  });

  describe('setActiveEnvironment', () => {
    it('finds the project containing the env and updates both ids', () => {
      let s = init();
      s = projectsReducer(
        s,
        createProject({
          ...project({ id: 'p-a' }),
          environments: [env({ id: 'e-1' }), env({ id: 'e-2' })],
        } as any),
      );
      s = projectsReducer(s, setActiveEnvironment('e-2'));
      expect(s.activeEnvironmentId).toBe('e-2');
      expect(s.activeProjectId).toBe('p-a');
    });

    it('is a no-op when no project owns the env', () => {
      let s = projectsReducer(init(), createProject({ ...project(), environments: [] } as any));
      const before = s.activeEnvironmentId;
      s = projectsReducer(s, setActiveEnvironment('orphan'));
      expect(s.activeEnvironmentId).toBe(before);
    });
  });

  describe('createFolder', () => {
    it('creates a top-level folder with order 0', () => {
      const s = projectsReducer(init(), createFolder({ name: 'F1', organisationId: 'org-1' }));
      expect(s.folders).toHaveLength(1);
      expect(s.folders[0].order).toBe(0);
      expect(s.folders[0].parentFolderId).toBeNull();
    });

    it('orders subsequent siblings after the first', () => {
      let s = projectsReducer(init(), createFolder({ name: 'F1', organisationId: 'org-1' }));
      s = projectsReducer(s, createFolder({ name: 'F2', organisationId: 'org-1' }));
      expect(s.folders.find((f) => f.name === 'F2')!.order).toBe(1);
    });

    it('respects parentFolderId for nested folders', () => {
      let s = projectsReducer(init(), createFolder({ name: 'F1', organisationId: 'org-1' }));
      const parent = s.folders[0].id;
      s = projectsReducer(
        s,
        createFolder({ name: 'F1.a', organisationId: 'org-1', parentFolderId: parent }),
      );
      const nested = s.folders.find((f) => f.name === 'F1.a')!;
      expect(nested.parentFolderId).toBe(parent);
      expect(nested.order).toBe(0);
    });
  });

  describe('renameFolder', () => {
    it('renames the folder', () => {
      let s = projectsReducer(init(), createFolder({ name: 'old', organisationId: 'org-1' }));
      const fid = s.folders[0].id;
      s = projectsReducer(s, renameFolder({ folderId: fid, name: 'new' }));
      expect(s.folders[0].name).toBe('new');
    });

    it('is a no-op for unknown id', () => {
      let s = projectsReducer(init(), createFolder({ name: 'F', organisationId: 'org-1' }));
      s = projectsReducer(s, renameFolder({ folderId: 'unknown', name: 'x' }));
      expect(s.folders[0].name).toBe('F');
    });
  });

  describe('deleteFolder', () => {
    it('removes the folder, re-parents children, and unhooks projects', () => {
      let s = init();
      s = projectsReducer(s, createFolder({ name: 'parent', organisationId: 'org-1' }));
      const parentId = s.folders[0].id;
      s = projectsReducer(s, createFolder({ name: 'child', organisationId: 'org-1', parentFolderId: parentId }));
      s = projectsReducer(
        s,
        createProject({ ...project({ id: 'p-in', folderId: parentId }), environments: [] } as any),
      );
      s = projectsReducer(s, deleteFolder(parentId));
      expect(s.folders.find((f) => f.id === parentId)).toBeUndefined();
      // Child folder re-parented to parent.parent (null in this case).
      const child = s.folders.find((f) => f.name === 'child')!;
      expect(child.parentFolderId).toBeNull();
      // Project's folderId nulled.
      const proj = s.projects.find((p) => p.id === 'p-in')!;
      expect(proj.folderId).toBeNull();
    });

    it('does not touch projects in other folders', () => {
      let s = init();
      s = projectsReducer(s, createFolder({ name: 'A', organisationId: 'org-1' }));
      const aId = s.folders[0].id;
      s = projectsReducer(s, createFolder({ name: 'B', organisationId: 'org-1' }));
      const bId = s.folders.find((f) => f.name === 'B')!.id;
      s = projectsReducer(
        s,
        createProject({ ...project({ id: 'in-a', folderId: aId }), environments: [] } as any),
      );
      s = projectsReducer(
        s,
        createProject({ ...project({ id: 'in-b', folderId: bId }), environments: [] } as any),
      );
      s = projectsReducer(s, deleteFolder(aId));
      // 'in-a' should be re-parented to root.
      expect(s.projects.find((p) => p.id === 'in-a')!.folderId).toBeNull();
      // 'in-b' should still belong to B.
      expect(s.projects.find((p) => p.id === 'in-b')!.folderId).toBe(bId);
    });

    it('re-parents children to grandparent when folder is nested', () => {
      let s = init();
      s = projectsReducer(s, createFolder({ name: 'gp', organisationId: 'org-1' }));
      const gp = s.folders[0].id;
      s = projectsReducer(s, createFolder({ name: 'parent', organisationId: 'org-1', parentFolderId: gp }));
      const parent = s.folders.find((f) => f.name === 'parent')!.id;
      s = projectsReducer(s, createFolder({ name: 'child', organisationId: 'org-1', parentFolderId: parent }));
      s = projectsReducer(s, deleteFolder(parent));
      const child = s.folders.find((f) => f.name === 'child')!;
      expect(child.parentFolderId).toBe(gp);
    });
  });

  describe('toggleFolderExpanded', () => {
    it('flips the flag', () => {
      let s = projectsReducer(init(), createFolder({ name: 'F', organisationId: 'org-1' }));
      const fid = s.folders[0].id;
      // Initial expanded=true.
      s = projectsReducer(s, toggleFolderExpanded(fid));
      expect(s.folders[0].expanded).toBe(false);
    });

    it('is a no-op for unknown id', () => {
      const s = projectsReducer(init(), toggleFolderExpanded('nope'));
      expect(s.folders).toEqual([]);
    });
  });

  describe('moveFolder', () => {
    it('moves a folder to a new parent and recomputes order', () => {
      let s = init();
      s = projectsReducer(s, createFolder({ name: 'A', organisationId: 'org-1' }));
      s = projectsReducer(s, createFolder({ name: 'B', organisationId: 'org-1' }));
      const aId = s.folders[0].id;
      const bId = s.folders[1].id;
      s = projectsReducer(s, moveFolder({ folderId: bId, parentFolderId: aId }));
      const movedB = s.folders.find((f) => f.id === bId)!;
      expect(movedB.parentFolderId).toBe(aId);
      expect(movedB.order).toBe(0);
    });

    it('refuses to create a cycle (folder cannot become its own descendant)', () => {
      let s = init();
      s = projectsReducer(s, createFolder({ name: 'A', organisationId: 'org-1' }));
      const aId = s.folders[0].id;
      s = projectsReducer(s, createFolder({ name: 'B', organisationId: 'org-1', parentFolderId: aId }));
      const bId = s.folders.find((f) => f.name === 'B')!.id;
      // Try to move A under B → cycle.
      s = projectsReducer(s, moveFolder({ folderId: aId, parentFolderId: bId }));
      const aAfter = s.folders.find((f) => f.id === aId)!;
      expect(aAfter.parentFolderId).toBeNull();
    });

    it('walks parent chain across multiple levels when checking for cycle', () => {
      let s = init();
      s = projectsReducer(s, createFolder({ name: 'A', organisationId: 'org-1' }));
      const aId = s.folders[0].id;
      s = projectsReducer(s, createFolder({ name: 'B', organisationId: 'org-1', parentFolderId: aId }));
      const bId = s.folders.find((f) => f.name === 'B')!.id;
      s = projectsReducer(s, createFolder({ name: 'C', organisationId: 'org-1', parentFolderId: bId }));
      const cId = s.folders.find((f) => f.name === 'C')!.id;
      // Try to move A under C → cycle through B.
      s = projectsReducer(s, moveFolder({ folderId: aId, parentFolderId: cId }));
      const aAfter = s.folders.find((f) => f.id === aId)!;
      expect(aAfter.parentFolderId).toBeNull();
    });

    it('moving to root sets parentFolderId null', () => {
      let s = init();
      s = projectsReducer(s, createFolder({ name: 'A', organisationId: 'org-1' }));
      const aId = s.folders[0].id;
      s = projectsReducer(s, createFolder({ name: 'B', organisationId: 'org-1', parentFolderId: aId }));
      const bId = s.folders.find((f) => f.name === 'B')!.id;
      s = projectsReducer(s, moveFolder({ folderId: bId, parentFolderId: null }));
      expect(s.folders.find((f) => f.id === bId)!.parentFolderId).toBeNull();
    });

    it('is a no-op for unknown id', () => {
      const s = projectsReducer(init(), moveFolder({ folderId: 'nope', parentFolderId: null }));
      expect(s.folders).toEqual([]);
    });
  });

  describe('fetchProjectTree extraReducer', () => {
    it('flips loading on pending', () => {
      const s = projectsReducer(init(), fetchProjectTree.pending('req-1', 'org-1'));
      expect(s.loading).toBe(true);
    });

    it('replaces the org slice on fulfilled and keeps other orgs intact', () => {
      // Pre-seed an existing org-2 project.
      let s = projectsReducer(
        init(),
        createProject({ ...project({ id: 'p-other', organisationId: 'org-2' }), environments: [] } as any),
      );
      const proj: Project = project({ id: 'p-new' });
      const folder: ProjectFolder = {
        id: 'f-new',
        name: 'F',
        organisationId: 'org-1',
        parentFolderId: null,
        expanded: true,
        order: 0,
      };
      s = projectsReducer(
        s,
        fetchProjectTree.fulfilled({ orgId: 'org-1', projects: [proj], folders: [folder] }, 'req-1', 'org-1'),
      );
      expect(s.loading).toBe(false);
      expect(s.loadedOrgId).toBe('org-1');
      expect(s.projects.find((p) => p.id === 'p-new')).toBeDefined();
      expect(s.projects.find((p) => p.id === 'p-other')).toBeDefined();
      expect(s.folders).toHaveLength(1);
    });

    it('clears loading on rejected', () => {
      let s = projectsReducer(init(), fetchProjectTree.pending('req-1', 'org-1'));
      s = projectsReducer(s, fetchProjectTree.rejected(null, 'req-1', 'org-1'));
      expect(s.loading).toBe(false);
    });
  });

  describe('selectors', () => {
    it('selectActiveProjectId / Env / loadedOrgId return the field', () => {
      let s: ProjectsState = init();
      s = projectsReducer(
        s,
        createProject({
          ...project({ id: 'p-1' }),
          environments: [env({ id: 'e-1' })],
        } as any),
      );
      expect(selectActiveProjectId({ projects: s })).toBe('p-1');
      expect(selectActiveEnvironmentId({ projects: s })).toBe('e-1');
      // loadedOrgId only set by fetchProjectTree.
      expect(selectLoadedOrgId({ projects: s })).toBeNull();
      s = projectsReducer(
        s,
        fetchProjectTree.fulfilled({ orgId: 'org-x', projects: [], folders: [] }, 'r-1', 'org-x'),
      );
      expect(selectLoadedOrgId({ projects: s })).toBe('org-x');
    });

    it('selectProjectsByOrg / selectFoldersByOrg filter and return [] when empty', () => {
      let s: ProjectsState = init();
      expect(selectProjectsByOrg('org-1')({ projects: s })).toEqual([]);
      expect(selectFoldersByOrg('org-1')({ projects: s })).toEqual([]);
      s = projectsReducer(
        s,
        createProject({ ...project({ id: 'p-1', organisationId: 'org-1' }), environments: [] } as any),
      );
      s = projectsReducer(
        s,
        createProject({ ...project({ id: 'p-2', organisationId: 'org-2' }), environments: [] } as any),
      );
      s = projectsReducer(s, createFolder({ name: 'F', organisationId: 'org-1' }));
      expect(selectProjectsByOrg('org-1')({ projects: s }).map((p) => p.id)).toEqual(['p-1']);
      expect(selectFoldersByOrg('org-1')({ projects: s })).toHaveLength(1);
      expect(selectFoldersByOrg('org-2')({ projects: s })).toEqual([]);
    });
  });
});
