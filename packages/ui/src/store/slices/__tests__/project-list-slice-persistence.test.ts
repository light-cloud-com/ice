/**
 * project-list-slice — `loadProjectListPrefs` hydration branches.
 *
 * Persistence has moved off localStorage onto the user-preferences
 * endpoint. The slice exposes `loadProjectListPrefs` which is
 * dispatched by the hydration flow. These tests exercise the reducer's
 * partial-payload branches.
 */

import { describe, it, expect } from 'vitest';
import projectListReducer, { loadProjectListPrefs } from '../project-list-slice';

describe('project-list-slice — loadProjectListPrefs hydration', () => {
  it('starts with empty defaults', () => {
    const s = projectListReducer(undefined, { type: '@@INIT' });
    expect(s.rootDirectory).toBeNull();
    expect(s.expandedFolders).toEqual([]);
  });

  it('hydrates rootDirectory and expandedFolders together', () => {
    const s = projectListReducer(
      undefined,
      loadProjectListPrefs({
        rootDirectory: '/Users/me/projects',
        expandedFolders: ['/p/a', '/p/b'],
      }),
    );
    expect(s.rootDirectory).toBe('/Users/me/projects');
    expect(s.expandedFolders).toEqual(['/p/a', '/p/b']);
  });

  it('accepts an explicit null rootDirectory', () => {
    const seeded = projectListReducer(undefined, loadProjectListPrefs({ rootDirectory: '/seed' }));
    const cleared = projectListReducer(seeded, loadProjectListPrefs({ rootDirectory: null }));
    expect(cleared.rootDirectory).toBeNull();
  });

  it('is a no-op when payload is null', () => {
    const initial = projectListReducer(undefined, { type: '@@INIT' });
    const next = projectListReducer(initial, loadProjectListPrefs(null));
    expect(next).toBe(initial);
  });

  it('ignores non-array expandedFolders', () => {
    const s = projectListReducer(
      undefined,
      loadProjectListPrefs({
        // @ts-expect-error — exercise runtime guard against bad payloads
        expandedFolders: 'not-an-array',
      }),
    );
    expect(s.expandedFolders).toEqual([]);
  });
});
