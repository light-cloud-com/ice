/**
 * Provider initialization helpers.
 *
 * Extracted from `EmbeddedSchemaProvider` (rf-esp-4). The dynamic import of
 * `@ice-engine/schemas/db` and the project-vs-bundled DB resolution live
 * here; the orchestrator class only holds the `registry` slot and the
 * `initialized` flag.
 *
 * Behaviour preserved verbatim:
 *  - initialize_registry: imports `../schemas/db` (relative to the caller's
 *    compiled file), tolerates a missing module, calls `get_schema_registry`
 *    if it exists, returns the registry.
 *  - resolve_db_path: returns project-local `.ice/schemas.db` if it exists,
 *    otherwise undefined (registry uses its own bundled default).
 *
 * NOTE: the `import('../schemas/db')` specifier is resolved relative to
 * the file that runs the import — keeping this here means the path stays
 * a sibling of the schema folder ('../../schemas/db' from this file
 * resolves to the same module that the original './schemas/db' relative
 * path did from `src/schema/`). Verified by passing all consumer tests.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { SqliteSchemaRegistry } from './sqlite-types';

/**
 * Resolve the database path used by the registry factory.
 * Prefers a project-specific DB at `<cwd>/.ice/schemas.db` when present,
 * otherwise returns `undefined` so the registry falls back to its bundled
 * default.
 */
export function resolve_db_path(): string | undefined {
  const project_db = path.join(process.cwd(), '.ice', 'schemas.db');
  if (fs.existsSync(project_db)) {
    return project_db;
  }
  return undefined;
}

/**
 * Dynamically import `../../schemas/db` and call `get_schema_registry`
 * if the export exists. Returns the registry instance, or `null` if
 * either the module is missing or the factory export is absent.
 *
 * `db_path` is forwarded to the factory; if `undefined`, the factory uses
 * its bundled default.
 */
export async function initialize_registry(db_path: string | undefined): Promise<SqliteSchemaRegistry | null> {
  // Dynamic import so the schemas package is optional at runtime.
  const schemas: Record<string, unknown> | null = await import('../../schemas/db').catch(() => null);
  if (schemas && typeof schemas.get_schema_registry === 'function') {
    const factory = schemas.get_schema_registry as (dbPath?: string) => SqliteSchemaRegistry;
    return factory(db_path);
  }
  return null;
}
