/**
 * Project List Slice
 *
 * Manages the project browser state with filesystem-based folders and files.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// =============================================================================
// Types
// =============================================================================

export interface ProjectFolder {
  id: string;
  name: string;
  path: string; // Actual filesystem path
  parentPath: string; // Parent directory path
  expanded: boolean;
}

export interface ProjectFile {
  id: string;
  name: string;
  path: string; // Actual filesystem path
  parentPath: string; // Parent directory path
  lastModified?: number;
}

interface ScanResult {
  files: Array<{
    id: string;
    name: string;
    path: string;
    parentPath: string;
    lastModified: number;
  }>;
  folders: Array<{
    id: string;
    name: string;
    path: string;
    parentPath: string;
  }>;
}

export interface ProjectListState {
  folders: ProjectFolder[];
  files: ProjectFile[];
  rootDirectory: string | null;
  isLoading: boolean;
  searchQuery: string;
  expandedFolders: string[]; // Array of folder paths that are expanded
}

// =============================================================================
// Persistence — none. Project-list state is per-session (root
// directory + expanded folders) and is restored from the DB via the
// user-preferences endpoint, not localStorage (see task #13).

// =============================================================================
// Initial State
// =============================================================================

const initialState: ProjectListState = {
  folders: [],
  files: [],
  rootDirectory: null,
  isLoading: false,
  searchQuery: '',
  expandedFolders: [],
};

// =============================================================================
// Slice
// =============================================================================

const projectListSlice = createSlice({
  name: 'projectList',
  initialState,
  reducers: {
    // Set root directory
    setRootDirectory: (state, action: PayloadAction<string | null>) => {
      state.rootDirectory = action.payload;
      state.isLoading = !!action.payload;
      if (!action.payload) {
        state.files = [];
        state.folders = [];
      }
    },

    // Set scan results (files and folders from filesystem)
    setScanResults: (state, action: PayloadAction<ScanResult>) => {
      const { files, folders } = action.payload;

      // Convert to our format, preserving expanded state
      state.files = files.map((f) => ({
        id: f.id,
        name: f.name,
        path: f.path,
        parentPath: f.parentPath,
        lastModified: f.lastModified,
      }));

      state.folders = folders.map((f) => ({
        id: f.id,
        name: f.name,
        path: f.path,
        parentPath: f.parentPath,
        expanded: state.expandedFolders.includes(f.path),
      }));

      state.isLoading = false;
    },

    // Set loading state
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },

    // Toggle folder expansion
    toggleFolder: (state, action: PayloadAction<string>) => {
      const folderPath = action.payload;
      const folder = state.folders.find((f) => f.path === folderPath);

      if (folder) {
        folder.expanded = !folder.expanded;

        // Update expanded array
        if (folder.expanded) {
          if (!state.expandedFolders.includes(folderPath)) {
            state.expandedFolders.push(folderPath);
          }
        } else {
          state.expandedFolders = state.expandedFolders.filter((p) => p !== folderPath);
        }
      }
    },

    // Set search query
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },

    /**
     * Hydrate the slice from the user-preferences DB payload. Called
     * once on app boot after `GET /api/profile/preferences` resolves.
     * Skips fields whose payload is null/undefined so a partial blob
     * doesn't blow away an in-memory value (e.g. user already started
     * a session before prefs landed).
     */
    loadProjectListPrefs: (
      state,
      action: PayloadAction<{ rootDirectory?: string | null; expandedFolders?: string[] } | null>,
    ) => {
      if (!action.payload) return;
      if (action.payload.rootDirectory !== undefined) {
        state.rootDirectory = action.payload.rootDirectory;
      }
      if (Array.isArray(action.payload.expandedFolders)) {
        state.expandedFolders = action.payload.expandedFolders;
      }
    },
  },
});

// =============================================================================
// Exports
// =============================================================================

export const { setRootDirectory, setScanResults, setLoading, toggleFolder, setSearchQuery, loadProjectListPrefs } =
  projectListSlice.actions;

export default projectListSlice.reducer;

// =============================================================================
// Selectors
// =============================================================================

export const selectRootDirectory = (state: { projectList: ProjectListState }) => state.projectList.rootDirectory;
export const selectProjectFiles = (state: { projectList: ProjectListState }) => state.projectList.files;
export const selectProjectFolders = (state: { projectList: ProjectListState }) => state.projectList.folders;
export const selectProjectSearchQuery = (state: { projectList: ProjectListState }) => state.projectList.searchQuery;
export const selectProjectListLoading = (state: { projectList: ProjectListState }) => state.projectList.isLoading;

// Get files filtered by search query
export const selectFilteredFiles = (state: { projectList: ProjectListState }) => {
  const { files, searchQuery } = state.projectList;
  if (!searchQuery.trim()) return files;
  const query = searchQuery.toLowerCase();
  return files.filter((f) => f.name.toLowerCase().includes(query));
};

// Get folders filtered by search query
export const selectFilteredFolders = (state: { projectList: ProjectListState }) => {
  const { folders, searchQuery } = state.projectList;
  if (!searchQuery.trim()) return folders;
  const query = searchQuery.toLowerCase();
  return folders.filter((f) => f.name.toLowerCase().includes(query));
};
