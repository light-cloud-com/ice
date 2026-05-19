/**
 * Unit tests for `services/ai/src/services/ai/provider.ts` — the lazy
 * provider singleton extracted in rf-aisvc-1 from `ai.service.ts`.
 *
 * Per `deploy-service-tests-must-import-vitest-explicitly`, vitest
 * globals are imported explicitly so the package's typecheck stays
 * green (the @ice/service-ai tsconfig does not pick up vitest's
 * ambient types).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  createProviderAsync: vi.fn(),
  getProvider: vi.fn(),
  fakeProvider: { name: 'fake-provider' } as Record<string, unknown>,
}));

vi.mock('@ice/ai', () => ({
  createProviderAsync: mocks.createProviderAsync,
  getProvider: mocks.getProvider,
}));

import { getAiProvider, getAiProviderSync, _resetProviderCacheForTests } from '../provider';

describe('getAiProvider', () => {
  beforeEach(() => {
    _resetProviderCacheForTests();
    mocks.createProviderAsync.mockReset();
    mocks.getProvider.mockReset();
  });

  it('calls createProviderAsync exactly once across multiple calls', async () => {
    mocks.createProviderAsync.mockResolvedValue(mocks.fakeProvider);

    const a = await getAiProvider();
    const b = await getAiProvider();
    const c = await getAiProvider();

    expect(a).toBe(mocks.fakeProvider);
    expect(b).toBe(mocks.fakeProvider);
    expect(c).toBe(mocks.fakeProvider);
    expect(mocks.createProviderAsync).toHaveBeenCalledTimes(1);
  });

  it('returns deeply identical resolved values on consecutive calls (memoization)', async () => {
    mocks.createProviderAsync.mockResolvedValue(mocks.fakeProvider);

    // The function is `async`, so the OUTER promise is fresh per call —
    // but the INNER cached promise (which createProviderAsync returns) is
    // reused, so both awaited values point at the exact same provider
    // object reference. createProviderAsync should fire exactly once.
    const [p1, p2] = await Promise.all([getAiProvider(), getAiProvider()]);

    expect(p1).toBe(p2);
    expect(mocks.createProviderAsync).toHaveBeenCalledTimes(1);
  });

  it('returns the underlying error when createProviderAsync rejects', async () => {
    const err = new Error('detection failed');
    mocks.createProviderAsync.mockRejectedValue(err);

    await expect(getAiProvider()).rejects.toBe(err);
    // Even on failure the promise is memoized — production accepts that the
    // first failure is sticky until restart; the test-only reset clears it.
    await expect(getAiProvider()).rejects.toBe(err);
    expect(mocks.createProviderAsync).toHaveBeenCalledTimes(1);
  });

  it('reset helper clears the cache so the next call re-detects', async () => {
    mocks.createProviderAsync.mockResolvedValueOnce(mocks.fakeProvider);
    await getAiProvider();
    expect(mocks.createProviderAsync).toHaveBeenCalledTimes(1);

    _resetProviderCacheForTests();
    const second = { name: 'second' };
    mocks.createProviderAsync.mockResolvedValueOnce(second);

    const provider = await getAiProvider();
    expect(provider).toBe(second);
    expect(mocks.createProviderAsync).toHaveBeenCalledTimes(2);
  });
});

describe('getAiProviderSync', () => {
  beforeEach(() => {
    _resetProviderCacheForTests();
    mocks.createProviderAsync.mockReset();
    mocks.getProvider.mockReset();
  });

  it('returns null when the provider has not been initialized', () => {
    mocks.getProvider.mockReturnValue(null);
    expect(getAiProviderSync()).toBeNull();
  });

  it('returns the cached provider once @ice/ai has resolved one', () => {
    mocks.getProvider.mockReturnValue(mocks.fakeProvider);
    expect(getAiProviderSync()).toBe(mocks.fakeProvider);
  });

  it('does not trigger createProviderAsync (sync-only path)', () => {
    mocks.getProvider.mockReturnValue(null);
    getAiProviderSync();
    getAiProviderSync();
    expect(mocks.createProviderAsync).not.toHaveBeenCalled();
  });
});
