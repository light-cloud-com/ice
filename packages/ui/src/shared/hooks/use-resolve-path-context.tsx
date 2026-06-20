/**
 * Shared path resolution (IA7).
 *
 * `useResolvePath` issues a POST per path segment to resolve folder/project IDs.
 * Four components used to call it independently — DynamicContent, Breadcrumbs,
 * ProjectBrowser, ResourcePalette — so every project-page navigation fired the
 * same resolution ~4×. This lifts the resolve to a single shell-level provider;
 * the four consumers read the shared result via `useResolvePathContext`.
 *
 * The provider preserves Breadcrumbs' top-route optimisation (resolve `[]` for
 * `/settings` and `/team`, which aren't folders/projects, so no wasted POST).
 * `TOP_ROUTES` lives here as the single source of truth so the provider's gate
 * and the breadcrumb label can't drift apart.
 */

import React, { createContext, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { useResolvePath, type ResolvedPath } from './use-resolve-path';

/** Top-level routes that are NOT folder/project paths (slug → breadcrumb label). */
export const TOP_ROUTES: Record<string, string> = {
  settings: 'Settings',
  team: 'Team',
};

const ResolvePathContext = createContext<ResolvedPath | null>(null);

export const ResolvePathProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);
  const isTopRoute = segments.length === 1 && segments[0] in TOP_ROUTES;
  const resolved = useResolvePath(isTopRoute ? [] : segments);
  return <ResolvePathContext.Provider value={resolved}>{children}</ResolvePathContext.Provider>;
};

/**
 * Read the shared, shell-level path resolution. Must be used under a
 * `ResolvePathProvider` (mounted at the app root).
 */
export function useResolvePathContext(): ResolvedPath {
  const ctx = useContext(ResolvePathContext);
  if (ctx === null) {
    throw new Error('useResolvePathContext must be used within a ResolvePathProvider');
  }
  return ctx;
}
