/**
 * Account Slice
 *
 * Manages user profile, organisation membership, and selected org.
 * When switching orgs, a new JWT is issued via /auth/switch-org.
 */

import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import axiosInstance from '../../shared/api/axios-instance';

export interface Organisation {
  id: string;
  name: string;
  role: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  organisations: Organisation[];
  onboardingCompleted: boolean;
  onboardingStep: number;
  defaultProvider: string | null;
  defaultRegion: string | null;
}

export interface AccountState {
  user: UserProfile | null;
  selectedOrg: Organisation | null;
  loading: boolean;
  error: string | null;
}

const initialState: AccountState = {
  user: null,
  selectedOrg: null,
  loading: false,
  error: null,
};

export const fetchProfile = createAsyncThunk('account/fetchProfile', async () => {
  const response = await axiosInstance.get('/auth/me');
  return response.data as UserProfile;
});

/**
 * Switch to a different organisation.
 * Calls /auth/switch-org to get a new JWT scoped to the target org,
 * then updates the in-memory + localStorage token so all subsequent
 * API calls use the new org-scoped JWT.
 */
export const switchOrganisation = createAsyncThunk('account/switchOrganisation', async (org: Organisation) => {
  const res = await axiosInstance.post('/auth/switch-org', { organisationId: org.id });
  const { token } = res.data;
  const { setAccessToken } = await import('../../shared/api/axios-instance');
  setAccessToken(token);
  return org;
});

const accountSlice = createSlice({
  name: 'account',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<UserProfile>) {
      state.user = action.payload;
      if (!state.selectedOrg && action.payload.organisations.length > 0) {
        state.selectedOrg = action.payload.organisations[0];
      }
    },
    setSelectedOrg(state, action: PayloadAction<Organisation>) {
      state.selectedOrg = action.payload;
    },
    addOrganisation(state, action: PayloadAction<Organisation>) {
      if (state.user) {
        state.user.organisations.push(action.payload);
      }
    },
    clearUser(state) {
      state.user = null;
      state.selectedOrg = null;
      state.loading = false;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProfile.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProfile.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
        if (!state.selectedOrg && action.payload.organisations.length > 0) {
          state.selectedOrg = action.payload.organisations[0];
        }
      })
      .addCase(fetchProfile.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to fetch profile';
      })
      .addCase(switchOrganisation.fulfilled, (state, action) => {
        state.selectedOrg = action.payload;
      })
      .addCase(switchOrganisation.rejected, (state, action) => {
        // Still update selectedOrg so the UI reflects the switch even if JWT update failed
        state.selectedOrg = action.meta.arg as Organisation;
      });
  },
});

export const { setUser, setSelectedOrg, addOrganisation, clearUser } = accountSlice.actions;
export default accountSlice.reducer;
