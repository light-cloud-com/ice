/**
 * Tests for the singleton `IceAPI` adapter slot exposed by `api-adapter.ts`.
 *
 * Behaviour covered:
 *  - `getApi()` throws a descriptive error before `setApiAdapter()` is called.
 *  - `setApiAdapter()` installs an instance, after which `getApi()` returns
 *    the same reference.
 *  - The slot is overwritable — calling `setApiAdapter` again replaces the
 *    previously installed instance.
 *
 * The module holds a private `_api` variable, so each test that wants the
 * "uninitialized" path uses `vi.resetModules() + dynamic import` to get a
 * fresh module instance.
 */

import { describe, it, expect, vi } from 'vitest';

async function freshModule() {
  vi.resetModules();
  return await import('../api-adapter');
}

describe('api-adapter — getApi() / setApiAdapter()', () => {
  it('throws a descriptive error when called before setApiAdapter()', async () => {
    const { getApi } = await freshModule();
    expect(() => getApi()).toThrow(/API adapter not initialized.*setApiAdapter/);
  });

  it('returns the registered instance after setApiAdapter()', async () => {
    const { getApi, setApiAdapter } = await freshModule();
    const stub = { graph: {}, schema: {}, resources: {} } as any;
    setApiAdapter(stub);
    expect(getApi()).toBe(stub);
  });

  it('overwrites the previously installed adapter on subsequent calls', async () => {
    const { getApi, setApiAdapter } = await freshModule();
    const first = { graph: {} } as any;
    const second = { graph: {} } as any;
    setApiAdapter(first);
    expect(getApi()).toBe(first);
    setApiAdapter(second);
    expect(getApi()).toBe(second);
    expect(getApi()).not.toBe(first);
  });
});
