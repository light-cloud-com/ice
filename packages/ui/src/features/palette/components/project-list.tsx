/**
 * Project List Component
 *
 * Displays a tree of project files and folders from the filesystem.
 */

import { FolderOpen, FolderPlus, FileText, ChevronRight, RefreshCw, PlayCircle } from 'lucide-react';
import React, { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { TREE_INDENT_PX, TREE_INDENT_BASE } from '../../../config/canvas-constants';
import { getApi } from '../../../shared/api/api-adapter';
import { SearchInput } from '../../../shared/components/ui/search-input';
import { cn } from '../../../shared/utils/cn';
import { createCard, importToActiveCard, type CardNode, type CardEdge } from '../../../store/slices/cards-slice';
import {
  setRootDirectory,
  setScanResults,
  setLoading,
  toggleFolder,
  setSearchQuery,
  selectRootDirectory,
  selectProjectFiles,
  selectProjectFolders,
  selectProjectSearchQuery,
  selectProjectListLoading,
  selectFilteredFiles,
  selectFilteredFolders,
  type ProjectFile,
  type ProjectFolder,
} from '../../../store/slices/project-list-slice';
import { openTabInPane } from '../../../store/slices/ui-slice';
import type { RootState } from '../../../store';

// =============================================================================
// Project Tree Item Component
// =============================================================================

interface ProjectTreeItemProps {
  type: 'folder' | 'file';
  name: string;
  path: string;
  expanded?: boolean;
  depth: number;
  fileCount?: number; // Number of files in folder (for display)
  onToggle?: () => void;
  onClick?: () => void;
  onDoubleClick?: () => void; // Double-click handler for folders
}

const ProjectTreeItem: React.FC<ProjectTreeItemProps> = ({
  type,
  name,
  path,
  expanded,
  depth,
  fileCount,
  onToggle,
  onClick,
  onDoubleClick,
}) => {
  const Icon = type === 'folder' ? FolderOpen : FileText;

  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer',
        'hover:bg-ice-hover transition-colors duration-150',
      )}
      style={{ paddingLeft: `${depth * TREE_INDENT_PX + TREE_INDENT_BASE}px` }}
      onClick={(e) => {
        e.stopPropagation();
        if (type === 'folder' && onToggle) {
          onToggle();
        } else if (onClick) {
          onClick();
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (type === 'folder' && onDoubleClick) {
          onDoubleClick();
        }
      }}
      title={type === 'folder' ? `${path} (double-click to open all)` : path}
    >
      {/* Expand arrow for folders */}
      {type === 'folder' && (
        <ChevronRight
          className={cn('w-3.5 h-3.5 text-ice-text-3 transition-transform duration-150', expanded && 'rotate-90')}
        />
      )}
      {type === 'file' && <div className="w-3.5" />}

      {/* Icon */}
      <Icon className={cn('w-4 h-4 flex-shrink-0', type === 'folder' ? 'text-amber-400/80' : 'text-ice-text-2')} />

      {/* Name */}
      <span className="flex-1 text-ice-base text-ice-text-1 truncate">{name}</span>

      {/* File count badge for folders */}
      {type === 'folder' && fileCount !== undefined && fileCount > 0 && (
        <span className="text-ice-xs px-1.5 py-0.5 rounded bg-ice-active text-ice-text-2">{fileCount}</span>
      )}
    </div>
  );
};

// =============================================================================
// Main ProjectList Component
// =============================================================================

export const ProjectList: React.FC = () => {
  const dispatch = useDispatch();
  const rootDirectory = useSelector(selectRootDirectory);
  const files = useSelector(selectProjectFiles);
  const folders = useSelector(selectProjectFolders);
  const searchQuery = useSelector(selectProjectSearchQuery);
  const isLoading = useSelector(selectProjectListLoading);
  const filteredFiles = useSelector(selectFilteredFiles);
  const filteredFolders = useSelector(selectFilteredFolders);
  const activePaneId = useSelector((state: RootState) => state.ui.splitView.activePaneId);

  // Scan directory when rootDirectory changes
  const scanDirectory = useCallback(
    async (dirPath: string) => {
      dispatch(setLoading(true));
      try {
        const api = getApi();
        const result = await api.projects.scanDirectory(dirPath);
        dispatch(setScanResults(result));
      } catch (error) {
        console.error('Failed to scan directory:', error);
        dispatch(setScanResults({ files: [], folders: [] }));
      } finally {
        dispatch(setLoading(false));
      }
    },
    [dispatch],
  );
  useEffect(() => {
    if (rootDirectory) {
      scanDirectory(rootDirectory);
    }
  }, [rootDirectory, scanDirectory]);

  const handleSelectDirectory = async () => {
    try {
      const api = getApi();
      const dirPath = await api.dialog.selectDirectory();
      if (dirPath) {
        dispatch(setRootDirectory(dirPath));
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  const handleLoadExamples = () => {
    const examplesPath = '/Users/juliakafarska/Desktop/lc-organized/ice/examples';
    dispatch(setRootDirectory(examplesPath));
  };

  const handleRefresh = () => {
    if (rootDirectory) {
      scanDirectory(rootDirectory);
    }
  };

  const handleAddFolder = async () => {
    if (!rootDirectory) return;

    const folderName = 'New Folder';
    try {
      {
        const api = getApi();
        const newPath = await api.projects.createFolder(rootDirectory, folderName);
        if (newPath) {
          // Rescan to pick up the new folder
          scanDirectory(rootDirectory);
        }
      }
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleOpenProject = async (file: ProjectFile) => {
    try {
      if (!getApi().graph) {
        console.error('Graph API not available');
        return;
      }

      const graphData = await getApi().graph.load(file.path);

      if (!graphData) {
        console.error('No graph data returned');
        return;
      }

      // Convert graph nodes to CardNodes
      const cardNodes: CardNode[] = (graphData.nodes || []).map((node: any) => ({
        id: node.id,
        type: node.type?.includes('.') ? 'resource' : 'block',
        position: node.position || { x: 100, y: 100 },
        width: node.size?.width || node.width || 220,
        height: node.size?.height || node.height || 80,
        parentId: undefined,
        data: {
          label: node.name || node.id,
          iceType: node.type,
          behavior: node.behavior || 'singleton',
          ...node.properties,
        },
      }));

      // Convert graph edges to CardEdges
      const cardEdges: CardEdge[] = (graphData.edges || []).map((edge: any) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        data: {
          relationship: edge.relationship,
        },
      }));

      // Create a new card
      const cardId = `card-${Date.now()}`;
      dispatch(createCard({ name: file.name, id: cardId }));
      dispatch(importToActiveCard({ nodes: cardNodes, edges: cardEdges }));
      dispatch(openTabInPane({ paneId: activePaneId, cardId }));
    } catch (error) {
      console.error('Failed to open project:', error);
    }
  };

  // Get all files recursively within a folder path
  const getAllFilesInFolder = (folderPath: string): ProjectFile[] => {
    const result: ProjectFile[] = [];

    // Get files directly in this folder
    const directFiles = files.filter((f) => f.parentPath === folderPath);
    result.push(...directFiles);

    // Get subfolders and recursively get their files
    const subfolders = folders.filter((f) => f.parentPath === folderPath);
    for (const subfolder of subfolders) {
      result.push(...getAllFilesInFolder(subfolder.path));
    }

    return result;
  };

  // Open all files in the current directory (recursively)
  const handleOpenAllProjects = async () => {
    if (!rootDirectory) return;

    const allFiles = files; // All scanned files
    if (allFiles.length === 0) return;

    for (const file of allFiles) {
      await handleOpenProject(file);
      // Small delay to avoid overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };

  // Open all files in a specific folder (recursively)
  const handleOpenFolderProjects = async (folder: ProjectFolder) => {
    const folderFiles = getAllFilesInFolder(folder.path);
    if (folderFiles.length === 0) return;

    for (const file of folderFiles) {
      await handleOpenProject(file);
      // Small delay to avoid overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };

  // Get items for a specific parent path
  const getFoldersInPath = (parentPath: string) => {
    return filteredFolders.filter((f) => f.parentPath === parentPath);
  };

  const getFilesInPath = (parentPath: string) => {
    return filteredFiles.filter((f) => f.parentPath === parentPath);
  };

  // Render folder and its contents recursively
  const renderFolder = (folder: ProjectFolder, depth: number = 0) => {
    const subfolders = getFoldersInPath(folder.path);
    const folderFiles = getFilesInPath(folder.path);
    const totalFilesInFolder = getAllFilesInFolder(folder.path).length;

    return (
      <div key={folder.path}>
        <ProjectTreeItem
          type="folder"
          name={folder.name}
          path={folder.path}
          expanded={folder.expanded}
          depth={depth}
          fileCount={totalFilesInFolder}
          onToggle={() => dispatch(toggleFolder(folder.path))}
          onDoubleClick={() => handleOpenFolderProjects(folder)}
        />
        {folder.expanded && (
          <>
            {subfolders.map((sub) => renderFolder(sub, depth + 1))}
            {folderFiles.map((file) => (
              <ProjectTreeItem
                key={file.path}
                type="file"
                name={file.name}
                path={file.path}
                depth={depth + 1}
                onClick={() => handleOpenProject(file)}
              />
            ))}
          </>
        )}
      </div>
    );
  };

  // Root level folders and files (directly in rootDirectory)
  const rootFolders = rootDirectory ? getFoldersInPath(rootDirectory) : [];
  const rootFiles = rootDirectory ? getFilesInPath(rootDirectory) : [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-ice-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-ice-sm font-medium text-ice-text-2 uppercase tracking-wider">Projects</span>
          <div className="flex items-center gap-1">
            {/* Open All button - only show when files exist */}
            {files.length > 0 && (
              <button
                onClick={handleOpenAllProjects}
                className="p-1.5 rounded hover:bg-ice-active transition-colors"
                title={`Open all ${files.length} projects`}
              >
                <PlayCircle className="w-4 h-4 text-green-400/70" />
              </button>
            )}
            <button
              onClick={handleAddFolder}
              className="p-1.5 rounded hover:bg-ice-active transition-colors"
              title="Add Folder"
              disabled={!rootDirectory}
            >
              <FolderPlus className={cn('w-4 h-4', rootDirectory ? 'text-ice-text-2' : 'text-ice-text-3')} />
            </button>
            <button
              onClick={handleRefresh}
              className={cn('p-1.5 rounded hover:bg-ice-active transition-colors', isLoading && 'animate-spin')}
              title="Refresh"
              disabled={!rootDirectory}
            >
              <RefreshCw className={cn('w-4 h-4', rootDirectory ? 'text-ice-text-2' : 'text-ice-text-3')} />
            </button>
            <button
              onClick={handleSelectDirectory}
              className="p-1.5 rounded hover:bg-ice-active transition-colors"
              title="Select Directory"
            >
              <FolderOpen className="w-4 h-4 text-ice-text-2" />
            </button>
          </div>
        </div>

        {/* Search */}
        <SearchInput
          value={searchQuery}
          onChange={(v) => dispatch(setSearchQuery(v))}
          placeholder="Search projects..."
          size="md"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
          </div>
        ) : !rootDirectory ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <FolderOpen className="w-12 h-12 text-ice-text-3 mb-3" />
            <p className="text-ice-base text-ice-text-2 mb-4">Select a directory to browse your projects</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleLoadExamples}
                className="px-4 py-2 text-ice-base font-medium rounded-md bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors"
              >
                Load Examples
              </button>
              <button
                onClick={handleSelectDirectory}
                className="px-4 py-2 text-ice-base font-medium rounded-md bg-ice-active text-ice-text-1 hover:bg-ice-active transition-colors"
              >
                Select Directory
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Show current directory path */}
            <div className="px-2 py-1.5 mb-2 text-ice-xs text-ice-text-3 truncate" title={rootDirectory}>
              {rootDirectory}
            </div>

            {/* Render folders */}
            {rootFolders.map((folder) => renderFolder(folder, 0))}

            {/* Render root-level files */}
            {rootFiles.map((file) => (
              <ProjectTreeItem
                key={file.path}
                type="file"
                name={file.name}
                path={file.path}
                depth={0}
                onClick={() => handleOpenProject(file)}
              />
            ))}

            {/* Show message if no files or folders found */}
            {rootFolders.length === 0 && rootFiles.length === 0 && (
              <div className="px-2 py-4 text-center">
                <p className="text-ice-sm text-ice-text-3">No .ice or .json files found in this directory</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-ice-border">
        <p className="text-ice-xs text-ice-text-3">
          {files.length} project{files.length !== 1 ? 's' : ''}
          {folders.length > 0 && `, ${folders.length} folder${folders.length !== 1 ? 's' : ''}`}
        </p>
      </div>
    </div>
  );
};

export default ProjectList;
