/**
 * Account Slice
 *
 * Manages user profile, organisation membership, and selected org.
 */

import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import axiosInstance from '@/shared/api/axios-instance';

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

interface AccountState {
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

const accountSlice = createSlice({
  name: 'account',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<UserProfile>) {
      state.user = action.payload;
      // Auto-select first org if none selected
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
      });
  },
});

export const { setUser, setSelectedOrg, addOrganisation, clearUser } = accountSlice.actions;
export default accountSlice.reducer;
