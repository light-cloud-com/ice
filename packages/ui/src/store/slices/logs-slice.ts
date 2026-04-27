/**
 * Logs Slice — Cloud Logging stream state for on-canvas Log Terminal blocks.
 *
 * One slot per `terminalNodeId` (the Monitoring.Log node id on the canvas).
 * The hook `use-log-stream.ts` is the only writer — components read via
 * `selectLogStream` / `selectLogEntries` / `selectLogStatus`.
 *
 * Type-mirroring note: `LogEntry` and `SourceResolution` are duplicated
 * from `services/deploy/src/services/log-stream.service.ts`. Frontend code
 * cannot import from `services/`, and `packages/types/` is a viable home
 * but out of scope for this unit (LT-5). The drift risk is low because
 * both shapes are append-only contracts and any divergence shows up as a
 * runtime decoding error in the hook. If the types stabilize beyond v1,
 * promote them to `packages/types/src/logs.ts` and import from both sides.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// ─── Types (mirrored from services/deploy/src/services/log-stream.service.ts) ──

export interface LogEntry {
  ts: string;
  level: 'debug' | 'info' | 'notice' | 'warn' | 'error';
  message: string;
  resource: { type: string; labels: Record<string, string> };
  insertId: string;
}

export type SourceResolution =
  | { state: 'resolved'; sourceNodeId: string; iceType: string; caveats?: string[] }
  | { state: 'pre-deploy'; sourceNodeId: string; iceType: string }
  | { state: 'ambiguous'; candidates: Array<{ nodeId: string; iceType: string; label?: string }> }
  | { state: 'unsupported-source'; sourceNodeId: string; iceType: string }
  | { state: 'permission-denied'; message: string }
  | { state: 'none' };

export type LogStreamMode = 'polling' | 'tail';

export type LogStreamStatus =
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'pre-deploy'
  | 'unsupported'
  | 'permission-denied'
  | 'ambiguous'
  | 'no-source'
  | 'error';

export interface LogStreamState {
  status: LogStreamStatus;
  mode: LogStreamMode;
  subscriptionId: string | null;
  source: SourceResolution | null;
  entries: LogEntry[];
  lastError: string | null;
}

export interface LogsState {
  byTerminalNodeId: Record<string, LogStreamState>;
}

// ─── Constants ─────────────────────────────────────────────────────────────

/** R5 cap. LT-3 enforces this server-side too; client trims as a defense. */
const MAX_ENTRIES = 200;
/** Cheap dedupe window — re-checking only the tail is enough for in-order
 *  Cloud Logging streams and avoids O(n) lookups on every append. */
const DEDUP_TAIL_WINDOW = 50;

// ─── Helpers ───────────────────────────────────────────────────────────────

function defaultStreamState(mode: LogStreamMode = 'polling'): LogStreamState {
  return {
    status: 'idle',
    mode,
    subscriptionId: null,
    source: null,
    entries: [],
    lastError: null,
  };
}

/** Maps `SourceResolution.state` → the user-facing `LogStreamStatus`. */
function statusForSource(source: SourceResolution): LogStreamStatus {
  switch (source.state) {
    case 'resolved':
      return 'streaming';
    case 'pre-deploy':
      return 'pre-deploy';
    case 'ambiguous':
      return 'ambiguous';
    case 'unsupported-source':
      return 'unsupported';
    case 'permission-denied':
      return 'permission-denied';
    case 'none':
      return 'no-source';
  }
}

function ensureSlot(state: LogsState, terminalNodeId: string, mode?: LogStreamMode): LogStreamState {
  let slot = state.byTerminalNodeId[terminalNodeId];
  if (!slot) {
    slot = defaultStreamState(mode);
    state.byTerminalNodeId[terminalNodeId] = slot;
  }
  return slot;
}

// ─── Slice ─────────────────────────────────────────────────────────────────

const initialState: LogsState = {
  byTerminalNodeId: {},
};

const logsSlice = createSlice({
  name: 'logs',
  initialState,
  reducers: {
    setStatus(state, action: PayloadAction<{ terminalNodeId: string; status: LogStreamStatus }>) {
      const { terminalNodeId, status } = action.payload;
      const slot = ensureSlot(state, terminalNodeId);
      slot.status = status;
    },

    setSubscription(
      state,
      action: PayloadAction<{ terminalNodeId: string; subscriptionId: string; mode: LogStreamMode }>,
    ) {
      const { terminalNodeId, subscriptionId, mode } = action.payload;
      const slot = ensureSlot(state, terminalNodeId, mode);
      slot.subscriptionId = subscriptionId;
      slot.mode = mode;
    },

    setSource(state, action: PayloadAction<{ terminalNodeId: string; source: SourceResolution }>) {
      const { terminalNodeId, source } = action.payload;
      const slot = ensureSlot(state, terminalNodeId);
      slot.source = source;
      slot.status = statusForSource(source);
      // A fresh source resolution clears any stale error string from a
      // prior connection attempt, except for permission-denied which
      // carries its own `message` and we want to show it as the placeholder.
      if (source.state === 'permission-denied') {
        slot.lastError = source.message;
      } else if (slot.lastError && source.state === 'resolved') {
        slot.lastError = null;
      }
    },

    appendEntry(state, action: PayloadAction<{ terminalNodeId: string; entry: LogEntry }>) {
      const { terminalNodeId, entry } = action.payload;
      const slot = ensureSlot(state, terminalNodeId);

      // Dedupe on insertId by scanning only the tail window. Full O(n)
      // dedupe would thrash on busy streams; the tail window catches
      // every realistic duplicate path (reconnect replay, server retry).
      const tailStart = Math.max(0, slot.entries.length - DEDUP_TAIL_WINDOW);
      for (let i = tailStart; i < slot.entries.length; i++) {
        if (slot.entries[i].insertId === entry.insertId) return;
      }

      slot.entries.push(entry);
      if (slot.entries.length > MAX_ENTRIES) {
        slot.entries.splice(0, slot.entries.length - MAX_ENTRIES);
      }
    },

    clearEntries(state, action: PayloadAction<{ terminalNodeId: string }>) {
      const slot = state.byTerminalNodeId[action.payload.terminalNodeId];
      if (slot) slot.entries = [];
    },

    setMode(state, action: PayloadAction<{ terminalNodeId: string; mode: LogStreamMode }>) {
      const slot = ensureSlot(state, action.payload.terminalNodeId);
      slot.mode = action.payload.mode;
    },

    setError(state, action: PayloadAction<{ terminalNodeId: string; message: string }>) {
      const slot = ensureSlot(state, action.payload.terminalNodeId);
      slot.status = 'error';
      slot.lastError = action.payload.message;
    },

    teardown(state, action: PayloadAction<{ terminalNodeId: string }>) {
      delete state.byTerminalNodeId[action.payload.terminalNodeId];
    },
  },
});

export const { setStatus, setSubscription, setSource, appendEntry, clearEntries, setMode, setError, teardown } =
  logsSlice.actions;

export default logsSlice.reducer;

// ─── Selectors ─────────────────────────────────────────────────────────────

export const selectLogStream = (state: { logs: LogsState }, terminalNodeId: string): LogStreamState | undefined =>
  state.logs.byTerminalNodeId[terminalNodeId];

const EMPTY_ENTRIES: LogEntry[] = [];
export const selectLogEntries = (state: { logs: LogsState }, terminalNodeId: string): LogEntry[] =>
  state.logs.byTerminalNodeId[terminalNodeId]?.entries ?? EMPTY_ENTRIES;

export const selectLogStatus = (state: { logs: LogsState }, terminalNodeId: string): LogStreamStatus =>
  state.logs.byTerminalNodeId[terminalNodeId]?.status ?? 'idle';
