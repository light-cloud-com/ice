/**
 * useProjectBrowserData — fetch + tree state for the Project Browser.
 *
 * Extracted from `components/project-browser.tsx` during rf-pbrws-3. Owns
 * the `items` / `flatFolders` / `loading` / `expanded` / `search` state and
 * the `fetchProjects` / `toggleExpand` callbacks. Re-fetches automatically
 * whenever `orgId` or `search` changes.
 *
 * The orchestrator passes in the dispatched org id (so the hook does not
 * need to read Redux directly). It returns a flat object the orchestrator
 * destructures.
 */

import { useCallback, useEffect, useState } from 'react';
import axiosInstance from '../../../shared/api/axios-instance';
import { buildTree } from '../utils/build-tree';
import type { ProjectNode } from '../types/project-node';

export interface UseProjectBrowserDataResult {
  items: ProjectNode[];
  flatFolders: ProjectNode[];
  loading: boolean;
  expanded: Set<string>;
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
  search: string;
  setSearch: (s: string) => void;
  fetchProjects: () => Promise<void>;
  toggleExpand: (id: string) => void;
}

export function useProjectBrowserData(orgId: string | undefined): UseProjectBrowserDataResult {
  const [items, setItems] = useState<ProjectNode[]>([]);
  const [flatFolders, setFlatFolders] = useState<ProjectNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('ice-project-expanded');
      return saved ? new Set(JSON.parse(saved)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });
  const [search, setSearch] = useState('');

  // Persist expanded state
  useEffect(() => {
    localStorage.setItem('ice-project-expanded', JSON.stringify([...expanded]));
  }, [expanded]);

  const fetchProjects = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await axiosInstance.post('/canvas/projects', {
        organisationId: orgId,
        ...(search ? { search } : {}),
      });
      const flat: ProjectNode[] = (res.data || []).map((p: any) => ({ ...p, children: [] }));

      // Save flat folders for move menu
      setFlatFolders(flat.filter((p) => p.type === 'folder'));

      setItems(buildTree(flat));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, search]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return {
    items,
    flatFolders,
    loading,
    expanded,
    setExpanded,
    search,
    setSearch,
    fetchProjects,
    toggleExpand,
  };
}
