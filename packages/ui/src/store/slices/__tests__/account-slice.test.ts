/**
 * Reducer + thunk tests for account-slice.
 *
 * Covers every reducer action plus the four async-thunk lifecycle
 * branches (fetchProfile pending/fulfilled/rejected, switchOrganisation
 * fulfilled/rejected). The thunks themselves are also driven directly
 * with axios mocked at the module boundary so the request body /
 * setAccessToken side-effect path is exercised.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  axiosPost: vi.fn(),
  setAccessToken: vi.fn(),
}));

vi.mock('../../../shared/api/axios-instance', () => ({
  default: {
    get: (...args: unknown[]) => mocks.axiosGet(...args),
    post: (...args: unknown[]) => mocks.axiosPost(...args),
  },
  setAccessToken: (...args: unknown[]) => mocks.setAccessToken(...args),
}));

import accountReducer, {
  setUser,
  setSelectedOrg,
  addOrganisation,
  clearUser,
  fetchProfile,
  switchOrganisation,
  type AccountState,
  type UserProfile,
  type Organisation,
} from '../account-slice';
import { configureStore } from '@reduxjs/toolkit';

function init(): AccountState {
  return accountReducer(undefined, { type: '@@INIT' });
}

function makeOrg(id: string, role = 'member'): Organisation {
  return { id, name: id, role };
}

function makeUser(orgs: Organisation[] = []): UserProfile {
  return {
    id: 'u-1',
    email: 'a@x.com',
    name: 'A',
    avatar: null,
    organisations: orgs,
    onboardingCompleted: true,
    onboardingStep: 3,
    defaultProvider: 'gcp',
    defaultRegion: 'us-central1',
  };
}

beforeEach(() => {
  mocks.axiosGet.mockReset();
  mocks.axiosPost.mockReset();
  mocks.setAccessToken.mockReset();
});

describe('account-slice — initial state', () => {
  it('seeds user/selectedOrg=null, not loading', () => {
    expect(init()).toEqual({ user: null, selectedOrg: null, loading: false, error: null });
  });
});

describe('synchronous reducers', () => {
  it('setUser writes user and auto-picks first org when none selected', () => {
    const user = makeUser([makeOrg('a'), makeOrg('b')]);
    const s = accountReducer(init(), setUser(user));
    expect(s.user).toBe(user);
    expect(s.selectedOrg).toEqual(makeOrg('a'));
  });

  it('setUser keeps existing selectedOrg if already set', () => {
    let s = accountReducer(init(), setSelectedOrg(makeOrg('keep')));
    s = accountReducer(s, setUser(makeUser([makeOrg('a')])));
    expect(s.selectedOrg).toEqual(makeOrg('keep'));
  });

  it('setUser leaves selectedOrg null when user has no orgs', () => {
    const s = accountReducer(init(), setUser(makeUser([])));
    expect(s.selectedOrg).toBeNull();
  });

  it('setSelectedOrg writes the org', () => {
    const s = accountReducer(init(), setSelectedOrg(makeOrg('z')));
    expect(s.selectedOrg).toEqual(makeOrg('z'));
  });

  it('addOrganisation appends to the user list when a user is set', () => {
    let s = accountReducer(init(), setUser(makeUser([makeOrg('a')])));
    s = accountReducer(s, addOrganisation(makeOrg('b')));
    expect(s.user!.organisations).toHaveLength(2);
    expect(s.user!.organisations[1]).toEqual(makeOrg('b'));
  });

  it('addOrganisation is a no-op when no user is set', () => {
    const s = accountReducer(init(), addOrganisation(makeOrg('a')));
    expect(s.user).toBeNull();
  });

  it('clearUser wipes everything', () => {
    let s = accountReducer(init(), setUser(makeUser([makeOrg('a')])));
    s = accountReducer(s, clearUser());
    expect(s).toEqual(init());
  });
});

describe('fetchProfile lifecycle', () => {
  it('flips loading on pending and clears error', () => {
    let s = accountReducer(init(), {
      type: 'account/fetchProfile/rejected',
      error: { message: 'old' },
      payload: undefined,
    } as any);
    s = accountReducer(s, fetchProfile.pending('r-1', undefined));
    expect(s.loading).toBe(true);
    expect(s.error).toBeNull();
  });

  it('writes user and auto-picks first org on fulfilled', () => {
    const user = makeUser([makeOrg('a'), makeOrg('b')]);
    const s = accountReducer(init(), fetchProfile.fulfilled(user, 'r-1', undefined));
    expect(s.loading).toBe(false);
    expect(s.user).toBe(user);
    expect(s.selectedOrg).toEqual(makeOrg('a'));
  });

  it('keeps existing selectedOrg on fulfilled when already set', () => {
    let s = accountReducer(init(), setSelectedOrg(makeOrg('keep')));
    s = accountReducer(s, fetchProfile.fulfilled(makeUser([makeOrg('a')]), 'r-1', undefined));
    expect(s.selectedOrg).toEqual(makeOrg('keep'));
  });

  it('does not auto-pick on fulfilled when user has zero orgs', () => {
    const s = accountReducer(init(), fetchProfile.fulfilled(makeUser([]), 'r-1', undefined));
    expect(s.selectedOrg).toBeNull();
  });

  it('writes the rejected error message', () => {
    const s = accountReducer(init(), fetchProfile.rejected(new Error('boom'), 'r-1', undefined));
    expect(s.loading).toBe(false);
    expect(s.error).toBe('boom');
  });

  it('falls back to default error message when rejection has no message', () => {
    const s = accountReducer(init(), {
      type: 'account/fetchProfile/rejected',
      error: {},
      payload: undefined,
    } as any);
    expect(s.error).toBe('Failed to fetch profile');
  });
});

describe('switchOrganisation lifecycle', () => {
  it('writes the new selectedOrg on fulfilled', () => {
    const org = makeOrg('target');
    const s = accountReducer(init(), switchOrganisation.fulfilled(org, 'r-1', org));
    expect(s.selectedOrg).toEqual(org);
  });

  it('still updates selectedOrg from meta.arg on rejected (UX consistency)', () => {
    const org = makeOrg('target');
    const s = accountReducer(init(), switchOrganisation.rejected(new Error('x'), 'r-1', org));
    expect(s.selectedOrg).toEqual(org);
  });
});

describe('thunks (drives axios + setAccessToken side effect)', () => {
  function makeStore() {
    return configureStore({ reducer: { account: accountReducer } });
  }

  it('fetchProfile() awaits axios.get(/auth/me) and dispatches fulfilled on success', async () => {
    const user = makeUser([makeOrg('a')]);
    mocks.axiosGet.mockResolvedValue({ data: user });
    const store = makeStore();
    await store.dispatch(fetchProfile() as any);
    expect(mocks.axiosGet).toHaveBeenCalledWith('/auth/me');
    expect(store.getState().account.user).toEqual(user);
  });

  it('switchOrganisation() POSTs to /auth/switch-org and updates the access token', async () => {
    mocks.axiosPost.mockResolvedValue({ data: { token: 'new-jwt' } });
    const store = makeStore();
    const org = makeOrg('next');
    await store.dispatch(switchOrganisation(org) as any);
    expect(mocks.axiosPost).toHaveBeenCalledWith('/auth/switch-org', { organisationId: 'next' });
    expect(mocks.setAccessToken).toHaveBeenCalledWith('new-jwt');
    expect(store.getState().account.selectedOrg).toEqual(org);
  });
});
