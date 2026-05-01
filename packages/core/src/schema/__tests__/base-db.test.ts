/**
 * Smoke import for `customization/base-db.ts` (rf-cload-3).
 *
 * NOTE: `get_base_db_path` is preserved byte-for-byte from the original
 * `customization-loader.ts`. The original function eagerly evaluates
 * `require.resolve('@ice-engine/schemas/data/ice-schemas.db')` as the
 * second array element, which throws in environments where that
 * package isn't installed (test env, fresh checkouts). The behavior is
 * a pre-existing wart, not introduced by this refactor — test coverage
 * therefore is restricted to the import smoke check; the orchestrator's
 * end-to-end "schema provider initializes" tests continue to exercise
 * the function in environments where the package IS installed.
 */
import { describe, expect, it } from 'vitest';
import * as base_db from '../customization/base-db.js';

describe('base-db module', () => {
  it('exports get_base_db_path as a function', () => {
    expect(typeof base_db.get_base_db_path).toBe('function');
  });
});
