/**
 * Projects Slice
 *
 * Manages Projects, Environments, and Folders.
 * Projects can be organized into nestable folders.
 * Each Environment is backed by a Card in cardsSlice.
 * State is persisted to localStorage.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SecurityLevel } from '../../config/templates/types';

// =============================================================================
// Types
// =============================================================================

export interface Environment {
  id: string; // 'env-{timestamp}-{type}'
  name: string; // 'Production', 'Staging', etc.
  type: 'production' | 'staging' | 'development' | 'pr';
  cardId: string; // FK → cardsSlice Card.id
  templateId: string | null;
  securityLevel: SecurityLevel;
  region: string;
  createdAt: number;
}

export interface Project {
  id: string; // 'proj-{timestamp}'
  name: string;
  description: string;
  provider: string;
  environments: Environment[];
  folderId: string | null; // null = top-level
  order: number; // sort order within parent folder
  expanded: boolean; // whether env children are visible in tree
  createdAt: number;
}

export interface ProjectFolder {
  id: string; // 'folder-{timestamp}'
  name: string;
  parentFolderId: string | null; // null = top-level, allows nesting
  expanded: boolean;
  order: number; // sort order within parent
}

export interface ProjectsState {
  projects: Project[];
  folders: ProjectFolder[];
  activeProjectId: string | null;
  activeEnvironmentId: string | null;
}

// =============================================================================
// Persistence
// =============================================================================

const STORAGE_KEY = 'ice-projects';

function loadPersistedState(): ProjectsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        projects: (parsed.projects || []).map((p: any) => ({
          ...p,
          folderId: p.folderId ?? null,
          order: p.order ?? 0,
          expanded: p.expanded ?? false,
        })),
        folders: parsed.folders || [],
        activeProjectId: parsed.activeProjectId || null,
        activeEnvironmentId: parsed.activeEnvironmentId || null,
      };
    }
  } catch {
    /* ignore corrupt data */
  }
  return { projects: [], folders: [], activeProjectId: null, activeEnvironmentId: null };
}

// =============================================================================
// Initial State
// =============================================================================

const initialState: ProjectsState = loadPersistedState();

// =============================================================================
// Helpers
// =============================================================================

function nextOrder(items: { order: number }[]): number {
  return items.length === 0 ? 0 : Math.max(...items.map((i) => i.order)) + 1;
}

// =============================================================================
// Slice
// =============================================================================

const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    // ── Project CRUD ────────────────────────────────────────────────────────

    createProject: (
      state,
      action: PayloadAction<Omit<Project, 'createdAt' | 'order' | 'expanded'>>
    ) => {
      const siblings = state.projects.filter(
        (p) => p.folderId === (action.payload.folderId ?? null)
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
      if (project) {
        project.name = action.payload.name;
      }
    },

    moveProjectToFolder: (
      state,
      action: PayloadAction<{ projectId: string; folderId: string | null }>
    ) => {
      const project = state.projects.find((p) => p.id === action.payload.projectId);
      if (project) {
        project.folderId = action.payload.folderId;
        const siblings = state.projects.filter(
          (p) => p.folderId === action.payload.folderId && p.id !== project.id
        );
        project.order = nextOrder(siblings);
      }
    },

    toggleProjectExpanded: (state, action: PayloadAction<string>) => {
      const project = state.projects.find((p) => p.id === action.payload);
      if (project) {
        project.expanded = !project.expanded;
      }
    },

    // ── Active selection ────────────────────────────────────────────────────

    setActiveProject: (state, action: PayloadAction<string>) => {
      // Always set the ID — works with both local and backend project IDs
      state.activeProjectId = action.payload;
      // If the project is in the local store, expand it and set env
      const project = state.projects.find((p) => p.id === action.payload);
      if (project) {
        state.activeEnvironmentId = project.environments[0]?.id || null;
        project.expanded = true;
      }
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

    // ── Environment CRUD ────────────────────────────────────────────────────

    // ── Folder CRUD ─────────────────────────────────────────────────────────

    createFolder: (
      state,
      action: PayloadAction<{ name: string; parentFolderId?: string | null }>
    ) => {
      const parentId = action.payload.parentFolderId ?? null;
      const siblings = state.folders.filter((f) => f.parentFolderId === parentId);
      const folder: ProjectFolder = {
        id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: action.payload.name,
        parentFolderId: parentId,
        expanded: true,
        order: nextOrder(siblings),
      };
      state.folders.push(folder);
    },

    renameFolder: (state, action: PayloadAction<{ folderId: string; name: string }>) => {
      const folder = state.folders.find((f) => f.id === action.payload.folderId);
      if (folder) {
        folder.name = action.payload.name;
      }
    },

    deleteFolder: (state, action: PayloadAction<string>) => {
      const folderId = action.payload;
      // Move contained projects to top-level
      state.projects.forEach((p) => {
        if (p.folderId === folderId) p.folderId = null;
      });
      // Move contained sub-folders to parent
      const folder = state.folders.find((f) => f.id === folderId);
      const parentId = folder?.parentFolderId ?? null;
      state.folders.forEach((f) => {
        if (f.parentFolderId === folderId) f.parentFolderId = parentId;
      });
      // Remove the folder
      state.folders = state.folders.filter((f) => f.id !== folderId);
    },

    toggleFolderExpanded: (state, action: PayloadAction<string>) => {
      const folder = state.folders.find((f) => f.id === action.payload);
      if (folder) {
        folder.expanded = !folder.expanded;
      }
    },

    moveFolder: (
      state,
      action: PayloadAction<{ folderId: string; parentFolderId: string | null }>
    ) => {
      const folder = state.folders.find((f) => f.id === action.payload.folderId);
      if (folder) {
        // Prevent circular nesting
        let parent = action.payload.parentFolderId;
        while (parent) {
          if (parent === folder.id) return; // would create cycle
          const parentFolder = state.folders.find((f) => f.id === parent);
          parent = parentFolder?.parentFolderId ?? null;
        }
        folder.parentFolderId = action.payload.parentFolderId;
        const siblings = state.folders.filter(
          (f) => f.parentFolderId === action.payload.parentFolderId && f.id !== folder.id
        );
        folder.order = nextOrder(siblings);
      }
    },
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

export const selectProjects = (state: { projects: ProjectsState }) => state.projects.projects;
export const selectFolders = (state: { projects: ProjectsState }) => state.projects.folders;
export const selectActiveProjectId = (state: { projects: ProjectsState }) =>
  state.projects.activeProjectId;
export const selectActiveEnvironmentId = (state: { projects: ProjectsState }) =>
  state.projects.activeEnvironmentId;
export const selectActiveProject = (state: { projects: ProjectsState }) =>
  state.projects.projects.find((p) => p.id === state.projects.activeProjectId) || null;
