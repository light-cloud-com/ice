/**
 * use-resolve-path-context (IA7) — the shell-level provider that resolves the
 * URL path ONCE and shares it, preserving the top-route ([]) optimisation.
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  pathname: '/',
  lastSegments: null as string[] | null,
  resolved: {
    loading: false,
    type: 'root' as 'root' | 'folder' | 'project' | 'notFound',
    id: null as string | null,
    name: '',
    subpage: 'canvas',
    breadcrumbs: [] as { label: string; path: string }[],
    orgPrefix: '',
  },
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: mocks.pathname }),
}));

vi.mock('../use-resolve-path', () => ({
  useResolvePath: (segments: string[]) => {
    mocks.lastSegments = segments;
    return mocks.resolved;
  },
}));

import { ResolvePathProvider, useResolvePathContext, TOP_ROUTES } from '../use-resolve-path-context';

beforeEach(() => {
  mocks.pathname = '/';
  mocks.lastSegments = null;
});

const renderWithProvider = (probe: React.FC) =>
  renderToString(<ResolvePathProvider>{React.createElement(probe)}</ResolvePathProvider>);

describe('ResolvePathProvider — segment resolution', () => {
  it('resolves the full URL segments on a normal project path', () => {
    mocks.pathname = '/folder-x/proj-y';
    renderWithProvider(() => null);
    expect(mocks.lastSegments).toEqual(['folder-x', 'proj-y']);
  });

  it('resolves [] for a top route (no wasted resolution POST)', () => {
    for (const route of Object.keys(TOP_ROUTES)) {
      mocks.pathname = `/${route}`;
      renderWithProvider(() => null);
      expect(mocks.lastSegments).toEqual([]);
    }
  });

  it('does NOT treat a deeper path that merely starts with a top-route slug as a top route', () => {
    mocks.pathname = '/settings/sub';
    renderWithProvider(() => null);
    expect(mocks.lastSegments).toEqual(['settings', 'sub']);
  });
});

describe('useResolvePathContext', () => {
  it('exposes the shared resolved value to consumers', () => {
    mocks.resolved = { ...mocks.resolved, type: 'project', id: 'p1', name: 'My Project' };
    let seen: unknown;
    const Probe: React.FC = () => {
      seen = useResolvePathContext();
      return null;
    };
    renderWithProvider(Probe);
    expect((seen as { id: string }).id).toBe('p1');
    expect((seen as { name: string }).name).toBe('My Project');
  });

  it('throws when used without a provider', () => {
    const Probe: React.FC = () => {
      useResolvePathContext();
      return null;
    };
    expect(() => renderToString(<Probe />)).toThrow(/ResolvePathProvider/);
  });
});
