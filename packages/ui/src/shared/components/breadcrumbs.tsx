/**
 * Universal Breadcrumbs — Community Edition
 *
 * Shows path from URL: Folder > Project > Subpage
 * Falls back to URL segments when resolver hasn't loaded yet.
 */

import { ChevronRight, Home } from 'lucide-react';
import React from 'react';
import { useSelector } from 'react-redux';
import { Link, useLocation } from 'react-router-dom';
import { useResolvePathContext, TOP_ROUTES } from '../hooks/use-resolve-path-context';
import type { RootState } from '../../store';

export const Breadcrumbs: React.FC = () => {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);
  const selectedOrg = useSelector((s: RootState) => s.account?.selectedOrg);

  const isTopRoute = segments.length === 1 && TOP_ROUTES[segments[0]];
  // IA7 — the resolution (with the same top-route gate) is now shared at the
  // shell; read it instead of firing a duplicate set of resolution POSTs.
  const resolved = useResolvePathContext();

  // Build crumbs from resolved data, or fall back to URL segments
  const crumbs: { label: string; path: string }[] = [];

  if (isTopRoute) {
    crumbs.push({ label: TOP_ROUTES[segments[0]], path: pathname });
  } else if (resolved.breadcrumbs.length > 0) {
    crumbs.push(...resolved.breadcrumbs);
  } else if (segments.length > 0) {
    // IA9 — fall back to URL-derived crumbs even WHILE the resolver is loading.
    // Gating this on `!resolved.loading` collapsed the trail to just Home on
    // every navigation, flickering the user's sense of location; the URL
    // segments already reflect where they are, so show a best-guess trail until
    // the resolved labels arrive.
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
