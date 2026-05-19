/**
 * Bundled base-database path resolution.
 *
 * Extracted from the standalone `get_base_db_path()` (rf-cload-3).
 *
 * Behaviour:
 *  - Tries the development path first (relative to `packages/core/dist`,
 *    walking up four levels to `schemas/data/ice-schemas.db`).
 *  - Falls back to `require.resolve('@ice-engine/schemas/data/ice-schemas.db')`
 *    with a string replace from `/index.js` to the data file path. The
 *    require.resolve call is **lazy**: only invoked while iterating
 *    candidates, and wrapped in try/catch — environments where the
 *    `@ice-engine/schemas` package isn't installed (test envs, fresh
 *    checkouts, monorepo dev mode) skip the fallback instead of throwing
 *    synchronously and never reaching the dev-path check (bugfix-2).
 *  - Returns the first existing path; if none exist, returns the dev path
 *    as a default so callers see a "file does not exist" error rather
 *    than an unresolved require.
 */
import * as fs from 'fs';
import * as path from 'path';

type CandidateProducer = () => string | null;

export function get_base_db_path(): string {
  // Each candidate is a thunk so resolution is deferred until iteration.
  // The installed-package path's `require.resolve` throws when the package
  // isn't on disk; the try/catch in the loop swallows that and moves on.
  const candidates: CandidateProducer[] = [
    // In development (relative to packages/core)
    () => path.join(__dirname, '..', '..', '..', '..', 'schemas', 'data', 'ice-schemas.db'),
    // When installed as a package
    () => {
      try {
        return require.resolve('@ice-engine/schemas/data/ice-schemas.db').replace('/index.js', '/data/ice-schemas.db');
      } catch {
        return null;
      }
    },
  ];

  for (const produce of candidates) {
    try {
      const p = produce();
      if (p !== null && fs.existsSync(p)) {
        return p;
      }
    } catch {
      // Continue to next candidate
    }
  }

  // Default path (may not exist)
  return path.join(__dirname, '..', '..', '..', '..', 'schemas', 'data', 'ice-schemas.db');
}
