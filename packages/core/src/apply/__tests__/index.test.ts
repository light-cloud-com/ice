/**
 * Smoke test for the apply barrel.
 *
 * `apply/types.ts` is pure type defs (compiles to an empty .js); `apply/index.ts`
 * is a re-export barrel. Importing the barrel here just verifies the runtime
 * exports are reachable so v8 coverage doesn't flag a phantom 0%.
 */

import { describe, it, expect } from 'vitest';
import * as apply from '..';

describe('apply barrel', () => {
  it('re-exports the apply engine entry points', () => {
    expect(typeof apply.apply_plan).toBe('function');
    expect(typeof apply.apply_succeeded).toBe('function');
    expect(typeof apply.get_failed_resources).toBe('function');
    expect(typeof apply.get_successful_resources).toBe('function');
  });
});
