/**
 * Resolves a URL path into folder/project IDs.
 *
 * Community edition: no org prefix required.
 * Platform edition: first segment is org slug (skipped).
 */

import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axiosInstance from '../api/axios-instance';
import { toSlug } from '../utils/slug';
import type { RootState } from '../../store';

interface ResolvedPath {
  loading: boolean;
  type: 'root' | 'folder' | 'project' | 'notFound';
  id: string | null;
  name: string;
  subpage: string;
  breadcrumbs: { label: string; path: string }[];
  orgPrefix: string;
}

const PROJECT_SUBPAGES = new Set(['settings', 'deploy', 'deployments', 'activity', 'table']);

export function useResolvePath(allSegments: string[]): ResolvedPath {
  const selectedOrg = useSelector((s: RootState) => s.account?.selectedOrg);
  const user = useSelector((s: RootState) => s.account?.user);
  const allSegmentsKey = allSegments.join('/');

  const [result, setResult] = useState<ResolvedPath>({
    loading: true,
    type: 'root',
    id: null,
    name: '',
    subpage: 'canvas',
    breadcrumbs: [],
    orgPrefix: '',
  });

  useEffect(() => {
    const orgSlug = selectedOrg ? toSlug(selectedOrg.name) : '';
    const orgPrefix = orgSlug ? `/${orgSlug}` : '';

    if (allSegments.length === 0) {
      setResult({ loading: false, type: 'root', id: null, name: '', subpage: 'canvas', breadcrumbs: [], orgPrefix });
      return;
    }

    // Determine path segments: skip org slug if it matches, otherwise treat all as path
    let pathSegments = allSegments;
    const firstSeg = allSegments[0];

    if (selectedOrg) {
      const matchedOrg = user?.organisations?.find((o) => toSlug(o.name) === firstSeg);
      if (matchedOrg) {
        pathSegments = allSegments.slice(1);
      }
    } else {
      // Community edition — no org prefix, all segments are path
      pathSegments = allSegments;
    }

    if (pathSegments.length === 0) {
      setResult({ loading: false, type: 'root', id: null, name: '', subpage: 'canvas', breadcrumbs: [], orgPrefix });
      return;
    }

    // Use orgId from selectedOrg or pass nothing (backend will use JWT or fallback)
    const orgId = selectedOrg?.id;

    let cancelled = false;

    const resolve = async () => {
      setResult((r) => ({ ...r, loading: true }));

      const breadcrumbs: { label: string; path: string }[] = [];
      let currentParentId: string | null = null;
      let resolvedType: 'root' | 'folder' | 'project' = 'root';
      let resolvedId: string | null = null;
      let resolvedName = '';
      let subpage = 'canvas';

      try {
        for (let i = 0; i < pathSegments.length; i++) {
          const seg = pathSegments[i];

          if (resolvedType === 'project' && PROJECT_SUBPAGES.has(seg)) {
            subpage = seg;
            breadcrumbs.push({
              label: seg.charAt(0).toUpperCase() + seg.slice(1),
              path: orgPrefix + '/' + pathSegments.slice(0, i + 1).join('/'),
            });
            break;
          }

          const res = await axiosInstance.post('/canvas/projects', {
            ...(orgId ? { organisationId: orgId } : {}),
            parentId: currentParentId,
          });

          const items = res.data as Array<{ id: string; name: string; slug: string; type: string }>;
          const match = items.find((item) => item.slug === seg || toSlug(item.name) === seg);

          if (!match) break;

          breadcrumbs.push({
            label: match.name,
            path: orgPrefix + '/' + pathSegments.slice(0, i + 1).join('/'),
          });

          if (match.type === 'folder') {
            currentParentId = match.id;
            resolvedType = 'folder';
            resolvedId = match.id;
            resolvedName = match.name;
          } else {
            resolvedType = 'project';
            resolvedId = match.id;
            resolvedName = match.name;
          }
        }
      } catch {
        // Failed
      }

      if (!cancelled) {
        const isNotFound = pathSegments.length > 0 && resolvedType === 'root' && breadcrumbs.length === 0;
        setResult({
          loading: false,
          type: isNotFound ? 'notFound' : resolvedType,
          id: resolvedId,
          name: resolvedName,
          subpage,
          breadcrumbs,
          orgPrefix,
        });
      }
    };

    resolve();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- use stable primitives only to avoid infinite re-render loops
  }, [selectedOrg?.id, allSegmentsKey]);

  return result;
}
