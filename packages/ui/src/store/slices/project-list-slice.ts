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

export interface ScanResult {
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
// Local Storage Keys
// =============================================================================

const STORAGE_KEYS = {
  root: 'ice-project-list-root',
  expandedFolders: 'ice-project-list-expanded',
};

// =============================================================================
// Load persisted state
// =============================================================================

function loadPersistedState(): { rootDirectory: string | null; expandedFolders: string[] } {
  try {
    const rootDirectory = localStorage.getItem(STORAGE_KEYS.root);
    const expandedJson = localStorage.getItem(STORAGE_KEYS.expandedFolders);
    const expandedFolders = expandedJson ? JSON.parse(expandedJson) : [];

    return {
      rootDirectory: rootDirectory || null,
      expandedFolders,
    };
  } catch {
    return { rootDirectory: null, expandedFolders: [] };
  }
}

// =============================================================================
// Initial State
// =============================================================================

const persisted = loadPersistedState();

const initialState: ProjectListState = {
  folders: [],
  files: [],
  rootDirectory: persisted.rootDirectory,
  isLoading: false,
  searchQuery: '',
  expandedFolders: persisted.expandedFolders,
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
      if (action.payload) {
        localStorage.setItem(STORAGE_KEYS.root, action.payload);
      } else {
        localStorage.removeItem(STORAGE_KEYS.root);
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

        // Persist expanded state
        try {
          localStorage.setItem(STORAGE_KEYS.expandedFolders, JSON.stringify(state.expandedFolders));
        } catch (e) {
          console.error('Failed to persist expanded folders:', e);
        }
      }
    },

    // Set search query
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
  },
});

// =============================================================================
// Exports
// =============================================================================

export const { setRootDirectory, setScanResults, setLoading, toggleFolder, setSearchQuery } = projectListSlice.actions;

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
