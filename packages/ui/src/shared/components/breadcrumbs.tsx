/**
 * Universal Breadcrumbs — Community Edition
 *
 * Shows path from URL: Folder > Project > Subpage
 * Falls back to URL segments when resolver hasn't loaded yet.
 */

import { ChevronRight, Home } from 'lucide-react';
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useResolvePath } from '../hooks/use-resolve-path';
import type { RootState } from '../../store';

const TOP_ROUTES: Record<string, string> = {
  settings: 'Settings',
  team: 'Team',
};

export const Breadcrumbs: React.FC = () => {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);
  const selectedOrg = useSelector((s: RootState) => s.account?.selectedOrg);

  const isTopRoute = segments.length === 1 && TOP_ROUTES[segments[0]];
  const resolved = useResolvePath(isTopRoute ? [] : segments);

  // Build crumbs from resolved data, or fall back to URL segments
  const crumbs: { label: string; path: string }[] = [];

  if (isTopRoute) {
    crumbs.push({ label: TOP_ROUTES[segments[0]], path: pathname });
  } else if (resolved.breadcrumbs.length > 0) {
    crumbs.push(...resolved.breadcrumbs);
  } else if (!resolved.loading && segments.length > 0) {
    // Fallback: build crumbs from URL segments (skip org slug)
    const start = selectedOrg ? 1 : 0;
    for (let i = start; i < segments.length; i++) {
      const label = segments[i].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      crumbs.push({ label, path: '/' + segments.slice(0, i + 1).join('/') });
    }
  }

  const homePath = resolved.orgPrefix || '/';

  return (
    <nav className="flex items-center gap-1 min-w-0">
      <Link
        to={homePath}
        className="flex items-center gap-1 text-ice-md text-ice-text-3 hover:text-ice-text-1 transition-colors rounded px-1 py-0.5 hover:bg-ice-hover shrink-0"
      >
        <Home className="w-3.5 h-3.5" />
      </Link>

      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <React.Fragment key={crumb.path}>
            <ChevronRight className="h-3 w-3 text-ice-text-3 shrink-0" />
            {isLast ? (
              <span className="text-ice-md text-ice-text-1 font-medium truncate">{crumb.label}</span>
            ) : (
              <Link
                to={crumb.path}
                className="text-ice-md text-ice-text-3 hover:text-ice-text-2 transition-colors truncate"
              >
                {crumb.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};
