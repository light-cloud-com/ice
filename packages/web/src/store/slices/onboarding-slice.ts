/**
 * Onboarding Slice
 *
 * Manages the onboarding wizard state: current step, selected provider/region,
 * team config, and completion status.
 */

import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import axiosInstance from '@/shared/api/axios-instance';

export interface OnboardingState {
  currentStep: number; // 1-5
  completed: boolean;
  loading: boolean;

  // Step 1
  defaultProvider: string | null;
  defaultRegion: string | null;

  // Step 2
  teamMode: 'create' | 'join' | null;
  teamName: string;
  inviteEmails: string[];

  // Step 3 (connect cloud)
  cloudConnected: boolean;

  // Step 4 (connect github)
  githubConnected: boolean;

  // Step 5 (first project)
  projectName: string;
  selectedTemplateId: string | null;
}

const initialState: OnboardingState = {
  currentStep: 1,
  completed: false,
  loading: false,

  defaultProvider: null,
  defaultRegion: null,

  teamMode: null,
  teamName: '',
  inviteEmails: [],

  cloudConnected: false,
  githubConnected: false,

  projectName: '',
  selectedTemplateId: null,
};

export const fetchOnboardingStatus = createAsyncThunk(
  'onboarding/fetchStatus',
  async () => {
    const res = await axiosInstance.get('/onboarding/status');
    return res.data;
  }
);

export const saveOnboardingStep = createAsyncThunk(
  'onboarding/saveStep',
  async (data: { step?: number; defaultProvider?: string; defaultRegion?: string }) => {
    const res = await axiosInstance.put('/onboarding/step', data);
    return res.data;
  }
);

export const completeOnboarding = createAsyncThunk(
  'onboarding/complete',
  async () => {
    const res = await axiosInstance.put('/onboarding/complete');
    return res.data;
  }
);

export const skipOnboarding = createAsyncThunk(
  'onboarding/skip',
  async () => {
    const res = await axiosInstance.put('/onboarding/skip');
    return res.data;
  }
);

const onboardingSlice = createSlice({
  name: 'onboarding',
  initialState,
  reducers: {
    setStep(state, action: PayloadAction<number>) {
      state.currentStep = action.payload;
    },
    setDefaultProvider(state, action: PayloadAction<string>) {
      state.defaultProvider = action.payload;
    },
    setDefaultRegion(state, action: PayloadAction<string>) {
      state.defaultRegion = action.payload;
    },
    setTeamMode(state, action: PayloadAction<'create' | 'join'>) {
      state.teamMode = action.payload;
    },
    setTeamName(state, action: PayloadAction<string>) {
      state.teamName = action.payload;
    },
    addInviteEmail(state, action: PayloadAction<string>) {
      if (action.payload.trim() && !state.inviteEmails.includes(action.payload.trim())) {
        state.inviteEmails.push(action.payload.trim());
      }
    },
    removeInviteEmail(state, action: PayloadAction<number>) {
      state.inviteEmails.splice(action.payload, 1);
    },
    setCloudConnected(state, action: PayloadAction<boolean>) {
      state.cloudConnected = action.payload;
    },
    setGithubConnected(state, action: PayloadAction<boolean>) {
      state.githubConnected = action.payload;
    },
    setProjectName(state, action: PayloadAction<string>) {
      state.projectName = action.payload;
    },
    setSelectedTemplateId(state, action: PayloadAction<string | null>) {
      state.selectedTemplateId = action.payload;
    },
    resetOnboarding() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOnboardingStatus.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchOnboardingStatus.fulfilled, (state, action) => {
        state.loading = false;
        state.completed = action.payload.onboarding_completed;
        // Cap step to max wizard steps to avoid blank screen if backend has step > 5
        state.currentStep = Math.min(action.payload.onboarding_step, 5);
        state.defaultProvider = action.payload.default_provider;
        state.defaultRegion = action.payload.default_region;
      })
      .addCase(fetchOnboardingStatus.rejected, (state) => {
        state.loading = false;
      })
      .addCase(completeOnboarding.fulfilled, (state) => {
        state.completed = true;
      })
      .addCase(skipOnboarding.fulfilled, (state) => {
        state.completed = true;
      });
  },
});

export const {
  setStep,
  setDefaultProvider,
  setDefaultRegion,
  setTeamMode,
  setTeamName,
  addInviteEmail,
  removeInviteEmail,
  setCloudConnected,
  setGithubConnected,
  setProjectName,
  setSelectedTemplateId,
  resetOnboarding,
} = onboardingSlice.actions;

export default onboardingSlice.reducer;
