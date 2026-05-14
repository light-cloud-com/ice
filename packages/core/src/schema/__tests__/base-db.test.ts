/**
 * Tests for `customization/base-db.ts` (rf-cload-3, bugfix-2).
 *
 * The pre-fix `get_base_db_path` eagerly evaluated
 * `require.resolve('@ice-engine/schemas/data/ice-schemas.db')` while
 * constructing the candidate array, BEFORE the `existsSync` loop ran.
 * In environments where `@ice-engine/schemas` isn't installed (test
 * envs, fresh checkouts, this monorepo's dev mode) `require.resolve`
 * threw synchronously and the function never reached the dev-path
 * check — even though the dev path might have been valid.
 *
 * The fix wraps each candidate in a thunk; resolution is deferred to
 * the loop, and the require.resolve thunk has its own try/catch so
 * a missing package degrades to "skip this candidate" instead of
 * crashing the whole function.
 *
 * `@ice-engine/schemas` is NOT installed in this monorepo (the
 * schemas package is `packages/schemas` published as `@ice/schemas`,
 * not the legacy `@ice-engine/schemas` name the loader still
 * references). That makes this repo the canonical reproduction
 * environment for the bug.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { get_base_db_path } from '../customization/base-db';

describe('get_base_db_path (bugfix-2: lazy require.resolve)', () => {
  it('exports get_base_db_path as a function', () => {
    expect(typeof get_base_db_path).toBe('function');
  });

  it('does not throw when @ice-engine/schemas is not installed', () => {
    // Pre-fix: this call threw `Cannot find module
    // '@ice-engine/schemas/data/ice-schemas.db'` because the candidate
    // array eagerly invoked require.resolve while being constructed.
    // Post-fix: the missing package is silently skipped.
    expect(() => get_base_db_path()).not.toThrow();
  });

  it('returns a string path ending in ice-schemas.db', () => {
    const result = get_base_db_path();
    expect(typeof result).toBe('string');
    expect(result.endsWith('ice-schemas.db')).toBe(true);
  });

  it('falls back to the dev path when no candidate file exists', () => {
    // With neither the dev path nor the installed-package path
    // resolvable, the function returns the dev-path string as a
    // default (so callers see a "file does not exist" error from
    // SQLite rather than an unresolved require).
    const result = get_base_db_path();
    expect(result).toContain('schemas');
    expect(result).toContain('ice-schemas.db');
  });

  describe('dev-path priority', () => {
    // Compute the same dev path `get_base_db_path` constructs from
    // its own `__dirname`. base-db.ts lives at
    // `packages/core/src/schema/customization/base-db.ts`; walking
    // up four levels lands at `packages/`, then + `schemas/data/...`
    // resolves to `packages/schemas/data/ice-schemas.db` (a path
    // that does NOT exist in this monorepo by default).
    const sut_dir = path.resolve(__dirname, '..', 'customization');
    const dev_file = path.join(sut_dir, '..', '..', '..', '..', 'schemas', 'data', 'ice-schemas.db');
    const dev_dir = path.dirname(dev_file);
    const dirs_to_clean: string[] = [];

    beforeAll(() => {
      // Create the dir tree if it doesn't already exist; track each
      // freshly-created level so `afterAll` only removes ours.
      let cursor = dev_dir;
      const to_create: string[] = [];
      while (!fs.existsSync(cursor)) {
        to_create.unshift(cursor);
        cursor = path.dirname(cursor);
      }
      for (const dir of to_create) {
        fs.mkdirSync(dir);
        dirs_to_clean.unshift(dir); // remove children before parents
      }
      if (!fs.existsSync(dev_file)) {
        fs.writeFileSync(dev_file, 'fake-db-content');
      }
    });

    afterAll(() => {
      if (fs.existsSync(dev_file)) {
        fs.unlinkSync(dev_file);
      }
      for (const dir of dirs_to_clean) {
        if (fs.existsSync(dir)) {
          fs.rmdirSync(dir);
        }
      }
    });

    it('returns the dev path when it exists (priority over fallback)', () => {
      const result = get_base_db_path();
      // `realpathSync` on both sides handles macOS's /var → /private/var
      // symlink (rf-cload-2 file-validators.test.ts pattern).
      expect(fs.realpathSync(result)).toBe(fs.realpathSync(dev_file));
    });
  });
});
