import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface GhostNode {
  id: string;
  iceType: string;
  label: string;
  position: { x: number; y: number };
  sourceNodeId: string;
  edgeRelationship: 'connects_to' | 'depends_on';
  edgeDirection: 'from' | 'to';
  createdAt: number;
}

interface GhostState {
  ghosts: GhostNode[];
}

const initialState: GhostState = {
  ghosts: [],
};

const ghostSlice = createSlice({
  name: 'ghosts',
  initialState,
  reducers: {
    setGhosts(state, action: PayloadAction<GhostNode[]>) {
      state.ghosts = action.payload;
    },
    dismissGhost(state, action: PayloadAction<string>) {
      state.ghosts = state.ghosts.filter((g) => g.id !== action.payload);
    },
    clearGhosts(state) {
      state.ghosts = [];
    },
  },
});

export const { setGhosts, dismissGhost, clearGhosts } = ghostSlice.actions;
export default ghostSlice.reducer;
