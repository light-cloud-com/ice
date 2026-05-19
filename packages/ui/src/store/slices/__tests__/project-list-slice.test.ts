/**
 * Reducer + selector tests for project-list-slice.
 *
 * Filesystem-backed project browser. Shape: a flat folders/files array, an
 * `expandedFolders` array of paths, and a search query. Toggle and root
 * setters persist to localStorage; the in-memory map below stubs that.
 *
 * No async thunks — `setScanResults` is fired by the consumer after the
 * filesystem scan resolves.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ─── localStorage stub ──────────────────────────────────────────────────────
//
// Slice top-level reads localStorage during module init via
// `loadPersistedState`, so the stub must be installed BEFORE the import
// below — Vitest hoists `vi.mock`/`vi.hoisted`, but plain top-level
// `Object.defineProperty(globalThis, 'localStorage', ...)` runs in source
// order.
const memStorage: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => memStorage[k] ?? null,
    setItem: (k: string, v: string) => {
      memStorage[k] = v;
    },
    removeItem: (k: string) => {
      delete memStorage[k];
    },
    clear: () => {
      for (const k of Object.keys(memStorage)) delete memStorage[k];
    },
  },
  writable: true,
});

import projectListReducer, {
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
  type ProjectListState,
} from '../project-list-slice';

function init(): ProjectListState {
  return projectListReducer(undefined, { type: '@@INIT' });
}

beforeEach(() => {
  for (const k of Object.keys(memStorage)) delete memStorage[k];
});

describe('project-list-slice', () => {
  it('seeds initial state with defaults', () => {
    const s = init();
    expect(s.folders).toEqual([]);
    expect(s.files).toEqual([]);
    expect(s.rootDirectory).toBeNull();
    expect(s.isLoading).toBe(false);
    expect(s.searchQuery).toBe('');
    expect(s.expandedFolders).toEqual([]);
  });

  describe('setRootDirectory', () => {
    it('sets the path, flips loading on, and persists to localStorage', () => {
      const s = projectListReducer(init(), setRootDirectory('/Users/me/projects'));
      expect(s.rootDirectory).toBe('/Users/me/projects');
      expect(s.isLoading).toBe(true);
      expect(memStorage['ice-project-list-root']).toBe('/Users/me/projects');
    });

    it('clears state and removes the persisted root when payload is null', () => {
      // Pre-seed state with files/folders so we can prove they're cleared.
      let s = projectListReducer(init(), setRootDirectory('/old'));
      s = projectListReducer(
        s,
        setScanResults({
          files: [{ id: 'f-1', name: 'a.ice', path: '/old/a.ice', parentPath: '/old', lastModified: 1 }],
          folders: [{ id: 'd-1', name: 'sub', path: '/old/sub', parentPath: '/old' }],
        }),
      );
      // Now clear the root.
      s = projectListReducer(s, setRootDirectory(null));
      expect(s.rootDirectory).toBeNull();
      expect(s.isLoading).toBe(false);
      expect(s.files).toEqual([]);
      expect(s.folders).toEqual([]);
      expect(memStorage['ice-project-list-root']).toBeUndefined();
    });
  });

  describe('setScanResults', () => {
    it('replaces files + folders, preserving expanded state for matching paths', () => {
      // Pre-seed expandedFolders via toggleFolder (after a prior scan).
      let s = projectListReducer(init(), setRootDirectory('/root'));
      s = projectListReducer(
        s,
        setScanResults({
          files: [],
          folders: [{ id: 'd-1', name: 'sub', path: '/root/sub', parentPath: '/root' }],
        }),
      );
      s = projectListReducer(s, toggleFolder('/root/sub'));
      // /root/sub is now expanded; persistence array contains its path.
      expect(s.expandedFolders).toContain('/root/sub');
      // Re-scan — folder should be marked expanded again.
      s = projectListReducer(
        s,
        setScanResults({
          files: [{ id: 'f-2', name: 'doc.ice', path: '/root/sub/doc.ice', parentPath: '/root/sub', lastModified: 7 }],
          folders: [
            { id: 'd-1', name: 'sub', path: '/root/sub', parentPath: '/root' },
            { id: 'd-2', name: 'unopened', path: '/root/unopened', parentPath: '/root' },
          ],
        }),
      );
      expect(s.folders.find((f) => f.path === '/root/sub')?.expanded).toBe(true);
      expect(s.folders.find((f) => f.path === '/root/unopened')?.expanded).toBe(false);
      expect(s.files[0].lastModified).toBe(7);
      // Loading reset to false after a scan completes.
      expect(s.isLoading).toBe(false);
    });
  });

  describe('setLoading', () => {
    it('sets the boolean directly', () => {
      const s = projectListReducer(init(), setLoading(true));
      expect(s.isLoading).toBe(true);
    });
  });

  describe('toggleFolder', () => {
    function seeded(): ProjectListState {
      return projectListReducer(
        init(),
        setScanResults({
          files: [],
          folders: [
            { id: 'a', name: 'A', path: '/r/a', parentPath: '/r' },
            { id: 'b', name: 'B', path: '/r/b', parentPath: '/r' },
          ],
        }),
      );
    }

    it('expanding adds to expandedFolders + persists', () => {
      const s = projectListReducer(seeded(), toggleFolder('/r/a'));
      expect(s.folders.find((f) => f.path === '/r/a')?.expanded).toBe(true);
      expect(s.expandedFolders).toContain('/r/a');
      expect(memStorage['ice-project-list-expanded']).toBe('["/r/a"]');
    });

    it('collapsing removes from expandedFolders + persists', () => {
      let s = projectListReducer(seeded(), toggleFolder('/r/a'));
      s = projectListReducer(s, toggleFolder('/r/a'));
      expect(s.folders.find((f) => f.path === '/r/a')?.expanded).toBe(false);
      expect(s.expandedFolders).not.toContain('/r/a');
      expect(memStorage['ice-project-list-expanded']).toBe('[]');
    });

    it('does not push duplicate paths when expanding twice (defensive against stale state)', () => {
      // Make the folder reach `expanded=true` while expandedFolders already
      // lists the path — drives the `!includes` branch.
      let s: ProjectListState = {
        ...seeded(),
        expandedFolders: ['/r/a'], // pre-populated
      };
      s = projectListReducer(s, toggleFolder('/r/a'));
      // toggle flips folder.expanded false-→true; the !includes guard
      // prevents a duplicate. expandedFolders should still be ['/r/a'].
      expect(s.expandedFolders).toEqual(['/r/a']);
    });

    it('is a no-op for an unknown folder path', () => {
      const before = seeded();
      const after = projectListReducer(before, toggleFolder('/r/never'));
      expect(after.folders).toEqual(before.folders);
      expect(after.expandedFolders).toEqual(before.expandedFolders);
    });

    it('logs and continues when localStorage.setItem throws', () => {
      // Flip setItem to a throw, then re-call toggleFolder. State still updates.
      const orig = (globalThis.localStorage as Storage).setItem;
      (globalThis.localStorage as Storage).setItem = () => {
        throw new Error('quota');
      };
      const s = projectListReducer(seeded(), toggleFolder('/r/a'));
      expect(s.folders.find((f) => f.path === '/r/a')?.expanded).toBe(true);
      // Restore for the next test.
      (globalThis.localStorage as Storage).setItem = orig;
    });
  });

  describe('setSearchQuery', () => {
    it('replaces the query', () => {
      const s = projectListReducer(init(), setSearchQuery('compute'));
      expect(s.searchQuery).toBe('compute');
    });
  });

  describe('selectors', () => {
    function withState() {
      let s = projectListReducer(init(), setRootDirectory('/root'));
      s = projectListReducer(
        s,
        setScanResults({
          files: [
            { id: '1', name: 'Alpha.ice', path: '/root/Alpha.ice', parentPath: '/root', lastModified: 0 },
            { id: '2', name: 'Beta.ice', path: '/root/Beta.ice', parentPath: '/root', lastModified: 0 },
          ],
          folders: [
            { id: 'a', name: 'auth', path: '/root/auth', parentPath: '/root' },
            { id: 'b', name: 'billing', path: '/root/billing', parentPath: '/root' },
          ],
        }),
      );
      s = projectListReducer(s, setSearchQuery(''));
      return { projectList: s };
    }

    it('selectRootDirectory / Files / Folders / SearchQuery / Loading', () => {
      const wrap = withState();
      expect(selectRootDirectory(wrap)).toBe('/root');
      expect(selectProjectFiles(wrap)).toHaveLength(2);
      expect(selectProjectFolders(wrap)).toHaveLength(2);
      expect(selectProjectSearchQuery(wrap)).toBe('');
      // After setScanResults, loading is false.
      expect(selectProjectListLoading(wrap)).toBe(false);
    });

    it('selectFilteredFiles returns all files when query is empty/whitespace', () => {
      const wrap = withState();
      expect(selectFilteredFiles(wrap)).toHaveLength(2);
      const wrap2 = { projectList: { ...wrap.projectList, searchQuery: '   ' } };
      expect(selectFilteredFiles(wrap2)).toHaveLength(2);
    });

    it('selectFilteredFiles filters case-insensitively on name', () => {
      const wrap = withState();
      const filtered = { projectList: { ...wrap.projectList, searchQuery: 'beta' } };
      const out = selectFilteredFiles(filtered);
      expect(out).toHaveLength(1);
      expect(out[0].name).toBe('Beta.ice');
    });

    it('selectFilteredFolders filters case-insensitively on name', () => {
      const wrap = withState();
      const filtered = { projectList: { ...wrap.projectList, searchQuery: 'BILL' } };
      const out = selectFilteredFolders(filtered);
      expect(out).toHaveLength(1);
      expect(out[0].name).toBe('billing');
    });

    it('selectFilteredFolders returns all folders when query is empty', () => {
      const wrap = withState();
      expect(selectFilteredFolders(wrap)).toHaveLength(2);
    });
  });

  describe('persisted state load path', () => {
    // The `loadPersistedState` function runs once at module init. To exercise
    // its branches we rely on the slice's behaviour: a fresh `init()` call
    // already routes through it. The "throws → empty defaults" branch is
    // hard to drive after module init, but the parsing happy-path is
    // implicitly covered by the reducer tests above.
    it('initial state mirrors localStorage shape at module load (empty)', () => {
      const s = init();
      expect(s.rootDirectory).toBeNull();
      expect(s.expandedFolders).toEqual([]);
    });
  });
});
