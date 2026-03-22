/**
 * Folder View — shows projects and subfolders
 *
 * Receives the already-resolved folderId from DynamicContent.
 * null = root level.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Folder, FolderOpen, FileText, Loader2, Plus } from 'lucide-react';
import axiosInstance from '@ui/shared/api/axios-instance';
import type { RootState } from '@ui/store';

interface FolderItem {
  id: string;
  name: string;
  slug: string;
  type: 'folder' | 'project';
  parent_id: string | null;
  cards: { id: string }[];
}

interface FolderViewProps {
  folderId: string | null;
  folderName: string;
  /** The resolved base path for this folder (e.g. "/folder-a/folder-b") */
  basePath?: string;
}

export const FolderView: React.FC<FolderViewProps> = ({ folderId, folderName, basePath = '' }) => {
  const navigate = useNavigate();
  const selectedOrg = useSelector((s: RootState) => s.account?.selectedOrg);
  const [items, setItems] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadItems = useCallback(async () => {
    if (!selectedOrg) return;
    setLoading(true);
    try {
      const res = await axiosInstance.post('/canvas/projects', {
        organisationId: selectedOrg.id,
        parentId: folderId,
      });
      setItems(res.data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [selectedOrg, folderId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleClick = (item: FolderItem) => {
    navigate(`${basePath}/${item.slug}`);
  };

  const handleCreate = async (type: 'folder' | 'project') => {
    if (!selectedOrg) return;
    try {
      const res = await axiosInstance.post('/canvas/projects/create', {
        name: type === 'folder' ? 'New Folder' : 'New Project',
        type,
        parentId: folderId,
        organisationId: selectedOrg.id,
      });
      await loadItems();
      // Navigate to the new project
      if (type === 'project' && res.data?.slug) {
        navigate(`${basePath}/${res.data.slug}`);
      }
    } catch (err) {
      console.error('Failed to create:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-ice-text-3" />
      </div>
    );
  }

  return (
    <div id="ice-folder-panel" className="max-w-3xl mx-auto py-10 px-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-ice-text-1">{folderName}</h1>
        <div className="flex gap-2">
          <button id="ice-folder-btn-create-project" onClick={() => handleCreate('project')} className="ice-btn ice-btn-primary text-ice-md px-3 py-1.5">
            <Plus className="w-3.5 h-3.5" />
            New Project
          </button>
          <button id="ice-folder-btn-create-folder" onClick={() => handleCreate('folder')} className="ice-btn ice-btn-ghost text-ice-md px-3 py-1.5 border border-ice-border">
            <Folder className="w-3.5 h-3.5" />
            New Folder
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-20">
          <FolderOpen className="w-12 h-12 text-ice-text-3 mx-auto mb-3" />
          <p className="text-ice-text-3 text-sm">
            {folderId ? 'This folder is empty' : 'No projects yet'}
          </p>
          <p className="text-ice-text-3 text-xs mt-1">Create a project or folder to get started</p>
        </div>
      ) : (
        <div className="border border-ice-border rounded-lg overflow-hidden divide-y divide-ice-border">
          {items
            .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1))
            .map((item) => (
              <button
                key={item.id}
                onClick={() => handleClick(item)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-ice-hover transition-colors text-left"
              >
                {item.type === 'folder' ? (
                  <Folder className="w-4 h-4 text-amber-500/70 shrink-0" />
                ) : (
                  <FileText className="w-4 h-4 text-ice-accent shrink-0" />
                )}
                <span className="text-sm text-ice-text-1 font-medium">{item.name}</span>
                <span className="text-xs text-ice-text-3 ml-auto">
                  {item.type === 'folder' ? 'Folder' : `${item.cards?.length || 0} cards`}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
};
