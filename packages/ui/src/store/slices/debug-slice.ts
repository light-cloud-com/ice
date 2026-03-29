/**
 * Debug State Slice
 *
 * Manages debug panel visibility and canvas diagnostic data.
 */

import { createSlice } from '@reduxjs/toolkit';

interface DebugState {
  /** Whether the debug overlay panel is visible */
  panelOpen: boolean;
  /** Last Redux action type */
  lastAction: string;
  /** Timestamp of last action */
  lastActionTime: number;
  /** Last render duration in ms */
  renderDuration: number;
}

const initialState: DebugState = {
  panelOpen: false,
  lastAction: '',
  lastActionTime: 0,
  renderDuration: 0,
};

const debugSlice = createSlice({
  name: 'debug',
  initialState,
  reducers: {
    toggleDebugPanel: (state) => {
      state.panelOpen = !state.panelOpen;
    },
  },
});

export const { toggleDebugPanel } = debugSlice.actions;

export default debugSlice.reducer;
