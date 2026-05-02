/**
 * Tests for the Community-edition `auth.ts` helpers.
 *
 * Auth in CE is fundamentally a no-op (the gateway auto-seeds the local
 * user) so the helpers are mostly compatibility stubs. We still exercise
 * every function so a future regression — say someone adds a real login
 * call without the matching CE branch — surfaces immediately.
 *
 * `getCurrentUser` is the only function that touches the network; we
 * mock the shared axios instance and drive both the success and error
 * branches.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAxios = {
  get: vi.fn(),
  post: vi.fn(),
};

vi.mock('../axios-instance', () => ({ default: mockAxios }));

beforeEach(() => {
  mockAxios.get.mockReset();
  mockAxios.post.mockReset();
});

describe('auth.isAuthenticated', () => {
  it('returns true unconditionally in Community edition', async () => {
    const { isAuthenticated } = await import('../auth');
    expect(isAuthenticated()).toBe(true);
  });
});

describe('auth.getCurrentUser', () => {
  it('returns the user payload from /auth/me on success', async () => {
    mockAxios.get.mockResolvedValueOnce({
      data: { id: 'u1', email: 'a@b.c', name: 'Alice', organisationId: 'o1' },
    });
    const { getCurrentUser } = await import('../auth');
    const user = await getCurrentUser();
    expect(mockAxios.get).toHaveBeenCalledWith('/auth/me');
    expect(user).toEqual({ id: 'u1', email: 'a@b.c', name: 'Alice', organisationId: 'o1' });
  });

  it('returns null when /auth/me throws (unauthenticated / network error)', async () => {
    mockAxios.get.mockRejectedValueOnce(new Error('network'));
    const { getCurrentUser } = await import('../auth');
    expect(await getCurrentUser()).toBeNull();
  });
});

describe('auth.logout', () => {
  it('resolves to undefined without making a network call', async () => {
    const { logout } = await import('../auth');
    expect(await logout()).toBeUndefined();
    expect(mockAxios.post).not.toHaveBeenCalled();
    expect(mockAxios.get).not.toHaveBeenCalled();
  });
});

describe('auth.login / register — community-edition stubs', () => {
  it('login() rejects with an explanatory error', async () => {
    const { login } = await import('../auth');
    await expect(login('a@b.c', 'pw')).rejects.toThrow(/Login not available.*Community/);
  });

  it('register() rejects with an explanatory error', async () => {
    const { register } = await import('../auth');
    await expect(register('Alice', 'a@b.c', 'pw')).rejects.toThrow(/Registration not available.*Community/);
  });
});

describe('auth.refreshToken / token getters/setters — backwards-compatible no-ops', () => {
  it('refreshToken() resolves to null', async () => {
    const { refreshToken } = await import('../auth');
    expect(await refreshToken()).toBeNull();
  });

  it('setAccessToken() returns nothing and is safe to call with any value', async () => {
    const { setAccessToken } = await import('../auth');
    expect(setAccessToken('whatever')).toBeUndefined();
    expect(setAccessToken(null)).toBeUndefined();
  });

  it('getAccessToken() returns null', async () => {
    const { getAccessToken } = await import('../auth');
    expect(getAccessToken()).toBeNull();
  });
});
