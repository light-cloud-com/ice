/**
 * View State Slice
 *
 * Manages hierarchical visualization state:
 * - Current view level (1/2)
 * - Empty container mode
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ViewLevel } from '../../config/visualization-config';

export interface ViewState {
  viewLevel: ViewLevel;
}

const initialState: ViewState = {
  viewLevel: 2,
};

const viewSlice = createSlice({
  name: 'view',
  initialState,
  reducers: {
    setViewLevel: (state, action: PayloadAction<ViewLevel>) => {
      state.viewLevel = action.payload;
    },
  },
});

export const { setViewLevel } = viewSlice.actions;

export default viewSlice.reducer;
