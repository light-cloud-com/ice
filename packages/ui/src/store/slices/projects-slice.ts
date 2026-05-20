/**
 * Projects Slice
 *
 * Manages Projects, Environments, and Folders in the sidebar tree.
 * Data is fetched from the backend API (org-scoped) and cached in Redux.
 * When the selected org changes, the tree is re-fetched.
 */

import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { SecurityLevel } from '../../config/templates';

// =============================================================================
// Types
// =============================================================================

export interface Environment {
  id: string;
  name: string;
  type: 'production' | 'staging' | 'development' | 'pr';
  cardId: string;
  templateId: string | null;
  securityLevel: SecurityLevel;
  region: string;
  createdAt: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  provider: string;
  organisationId: string;
  environments: Environment[];
  folderId: string | null;
  order: number;
  expanded: boolean;
  createdAt: number;
}

export interface ProjectFolder {
  id: string;
  name: string;
  organisationId: string;
  parentFolderId: string | null;
  expanded: boolean;
  order: number;
}

export interface ProjectsState {
  projects: Project[];
  folders: ProjectFolder[];
  activeProjectId: string | null;
  activeEnvironmentId: string | null;
  loading: boolean;
  loadedOrgId: string | null;
}

// =============================================================================
// Async Thunks
// =============================================================================

/**
 * Fetch all projects and folders for the given org from the backend.
 * The backend route POST /canvas/projects returns items scoped by JWT org.
 */
export const fetchProjectTree = createAsyncThunk('projects/fetchProjectTree', async (orgId: string) => {
  const { default: axiosInstance } = await import('../../shared/api/axios-instance');
  const res = await axiosInstance.post('/canvas/projects', {});
  const items = res.data as Array<{
    id: string;
    name: string;
    description?: string;
    type: string;
    parent_id: string | null;
    organisation_id: string;
    slug?: string;
    provider?: string;
    created_at?: string;
    cards?: Array<{ id: string; name: string }>;
    environments?: Array<{
      id: string;
      name: string;
      type: string;
      card_id: string;
      is_protected?: boolean;
      region?: string;
      pr_number?: number;
    }>;
  }>;

  const projects: Project[] = [];
  const folders: ProjectFolder[] = [];

  for (const item of items) {
    if (item.type === 'folder') {
      folders.push({
        id: item.id,
        name: item.name,
        organisationId: orgId,
        parentFolderId: item.parent_id,
        expanded: true,
        order: 0,
      });
    } else {
      projects.push({
        id: item.id,
        name: item.name,
        description: item.description || '',
        provider: item.provider || '',
        organisationId: orgId,
        environments: (item.environments || []).map((e) => ({
          id: e.id,
          name: e.name,
          type: (e.type || 'development') as Environment['type'],
          cardId: e.card_id,
          templateId: null,
          securityLevel: 'standard' as SecurityLevel,
          region: e.region || '',
          createdAt: 0,
        })),
        folderId: item.parent_id,
        order: 0,
        expanded: false,
        createdAt: item.created_at ? new Date(item.created_at).getTime() : 0,
      });
    }
  }

  return { orgId, projects, folders };
});

// =============================================================================
// Helpers
// =============================================================================

function nextOrder(items: { order: number }[]): number {
  return items.length === 0 ? 0 : Math.max(...items.map((i) => i.order)) + 1;
}

// =============================================================================
// Slice
// =============================================================================

const initialState: ProjectsState = {
  projects: [],
  folders: [],
  activeProjectId: null,
  activeEnvironmentId: null,
  loading: false,
  loadedOrgId: null,
};

const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    // ── Project CRUD (local optimistic updates) ─────────────────────────────

    createProject: (state, action: PayloadAction<Omit<Project, 'createdAt' | 'order' | 'expanded'>>) => {
      // Check if project already exists (from backend fetch)
      if (state.projects.some((p) => p.id === action.payload.id)) return;
      const orgId = action.payload.organisationId;
      const siblings = state.projects.filter(
        (p) => p.folderId === (action.payload.folderId ?? null) && p.organisationId === orgId,
      );
      const project: Project = {
        ...action.payload,
        order: nextOrder(siblings),
        expanded: true,
        createdAt: Date.now(),
      };
      state.projects.push(project);
      state.activeProjectId = project.id;
      if (project.environments.length > 0) {
        state.activeEnvironmentId = project.environments[0].id;
      }
    },

    deleteProject: (state, action: PayloadAction<string>) => {
      const index = state.projects.findIndex((p) => p.id === action.payload);
      if (index === -1) return;
      state.projects.splice(index, 1);
      if (state.activeProjectId === action.payload) {
        state.activeProjectId = state.projects[0]?.id || null;
        state.activeEnvironmentId = state.projects[0]?.environments[0]?.id || null;
      }
    },

    renameProject: (state, action: PayloadAction<{ projectId: string; name: string }>) => {
      const project = state.projects.find((p) => p.id === action.payload.projectId);
      if (project) project.name = action.payload.name;
    },

    moveProjectToFolder: (state, action: PayloadAction<{ projectId: string; folderId: string | null }>) => {
      const project = state.projects.find((p) => p.id === action.payload.projectId);
      if (project) {
        project.folderId = action.payload.folderId;
        const siblings = state.projects.filter((p) => p.folderId === action.payload.folderId && p.id !== project.id);
        project.order = nextOrder(siblings);
      }
    },

    toggleProjectExpanded: (state, action: PayloadAction<string>) => {
      const project = state.projects.find((p) => p.id === action.payload);
      if (project) project.expanded = !project.expanded;
    },

    // ── Active selection ────────────────────────────────────────────────────

    setActiveProject: (state, action: PayloadAction<string>) => {
      // findings.md #30 — gate on existence so a stale callsite (or
      // a deep-link before fetchProjects has resolved) can't pin a
      // non-existent id into activeProjectId. Sister-slice
      // `setActiveEnvironment` already does this; aligning behavior.
      const project = state.projects.find((p) => p.id === action.payload);
      if (!project) return;
      state.activeProjectId = action.payload;
      state.activeEnvironmentId = project.environments[0]?.id || null;
      project.expanded = true;
    },

    setActiveEnvironment: (state, action: PayloadAction<string>) => {
      for (const project of state.projects) {
        if (project.environments.some((e) => e.id === action.payload)) {
          state.activeProjectId = project.id;
          state.activeEnvironmentId = action.payload;
          return;
        }
      }
    },

    // ── Folder CRUD ─────────────────────────────────────────────────────────

    createFolder: (
      state,
      action: PayloadAction<{ name: string; organisationId: string; parentFolderId?: string | null }>,
    ) => {
      const parentId = action.payload.parentFolderId ?? null;
      const orgId = action.payload.organisationId;
      const siblings = state.folders.filter((f) => f.parentFolderId === parentId && f.organisationId === orgId);
      const folder: ProjectFolder = {
        id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: action.payload.name,
        organisationId: orgId,
        parentFolderId: parentId,
        expanded: true,
        order: nextOrder(siblings),
      };
      state.folders.push(folder);
    },

    renameFolder: (state, action: PayloadAction<{ folderId: string; name: string }>) => {
      const folder = state.folders.find((f) => f.id === action.payload.folderId);
      if (folder) folder.name = action.payload.name;
    },

    deleteFolder: (state, action: PayloadAction<string>) => {
      const folderId = action.payload;
      state.projects.forEach((p) => {
        if (p.folderId === folderId) p.folderId = null;
      });
      const folder = state.folders.find((f) => f.id === folderId);
      const parentId = folder?.parentFolderId ?? null;
      state.folders.forEach((f) => {
        if (f.parentFolderId === folderId) f.parentFolderId = parentId;
      });
      state.folders = state.folders.filter((f) => f.id !== folderId);
    },

    toggleFolderExpanded: (state, action: PayloadAction<string>) => {
      const folder = state.folders.find((f) => f.id === action.payload);
      if (folder) folder.expanded = !folder.expanded;
    },

    moveFolder: (state, action: PayloadAction<{ folderId: string; parentFolderId: string | null }>) => {
      const folder = state.folders.find((f) => f.id === action.payload.folderId);
      if (folder) {
        let parent = action.payload.parentFolderId;
        while (parent) {
          if (parent === folder.id) return;
          const parentFolder = state.folders.find((f) => f.id === parent);
          parent = parentFolder?.parentFolderId ?? null;
        }
        folder.parentFolderId = action.payload.parentFolderId;
        const siblings = state.folders.filter(
          (f) => f.parentFolderId === action.payload.parentFolderId && f.id !== folder.id,
        );
        folder.order = nextOrder(siblings);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProjectTree.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchProjectTree.fulfilled, (state, action) => {
        const { orgId, projects, folders } = action.payload;
        // Replace projects/folders for this org, keep other orgs' data
        state.projects = [...state.projects.filter((p) => p.organisationId !== orgId), ...projects];
        state.folders = [...state.folders.filter((f) => f.organisationId !== orgId), ...folders];
        state.loadedOrgId = orgId;
        state.loading = false;
      })
      .addCase(fetchProjectTree.rejected, (state) => {
        state.loading = false;
      });
  },
});

// =============================================================================
// Exports
// =============================================================================

export const {
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
} = projectsSlice.actions;

export default projectsSlice.reducer;

// =============================================================================
// Selectors
// =============================================================================

export const selectActiveProjectId = (state: { projects: ProjectsState }) => state.projects.activeProjectId;
export const selectActiveEnvironmentId = (state: { projects: ProjectsState }) => state.projects.activeEnvironmentId;
export const selectLoadedOrgId = (state: { projects: ProjectsState }) => state.projects.loadedOrgId;

/** Projects filtered by organisation ID */
export const selectProjectsByOrg = (orgId: string) => (state: { projects: ProjectsState }) =>
  state.projects.projects.filter((p) => p.organisationId === orgId);
/** Folders filtered by organisation ID */
export const selectFoldersByOrg = (orgId: string) => (state: { projects: ProjectsState }) =>
  state.projects.folders.filter((f) => f.organisationId === orgId);
