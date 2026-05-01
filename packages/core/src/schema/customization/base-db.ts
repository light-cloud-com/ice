/**
 * Bundled base-database path resolution.
 *
 * Extracted from the standalone `get_base_db_path()` (rf-cload-3).
 *
 * Behaviour preserved verbatim:
 *  - Tries the development path first (relative to `packages/core/dist`,
 *    walking up four levels to `schemas/data/ice-schemas.db`).
 *  - Falls back to `require.resolve('@ice-engine/schemas/data/ice-schemas.db')`
 *    with a string replace from `/index.js` to the data file path.
 *  - Returns the first existing path; if none exist, returns the dev path
 *    as a default so callers see a "file does not exist" error rather
 *    than an unresolved require.
 */
import * as fs from 'fs';
import * as path from 'path';

export function get_base_db_path(): string {
  // Try to find the base database from the schemas package
  const possible_paths = [
    // In development (relative to packages/core)
    path.join(__dirname, '..', '..', '..', '..', 'schemas', 'data', 'ice-schemas.db'),
    // When installed as a package
    require.resolve('@ice-engine/schemas/data/ice-schemas.db').replace('/index.js', '/data/ice-schemas.db'),
  ];

  for (const p of possible_paths) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch {
      // Continue to next path
    }
  }

  // Default path (may not exist)
  return path.join(__dirname, '..', '..', '..', '..', 'schemas', 'data', 'ice-schemas.db');
}
