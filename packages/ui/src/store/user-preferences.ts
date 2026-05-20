/**
 * User Preferences — DB-backed UI state.
 *
 * Replaces the localStorage cache the slices used to write to. Panel
 * visibility, split-view layout, project-tree expanded-folders, and
 * the file-mode root directory all live on `User.preferences` (JSON
 * blob).
 *
 * Two entry points wired from `store/index.ts`:
 *
 *   - `hydrateUserPreferences()` — call on app boot (after auth /
 *     profile fetch). Fans the loaded payload out to ui-slice +
 *     project-list-slice via `loadUiPrefs` / `loadProjectListPrefs`.
 *   - The exported `subscribeUserPreferencesAutoSave(store)` installs
 *     a debounced subscriber that PUTs the current relevant state
 *     whenever it changes. Subscription is a no-op until the hydrate
 *     has resolved at least once, so we don't overwrite the
 *     server-side payload with the slice defaults on first boot.
 */

import { loadProjectListPrefs } from './slices/project-list-slice';
import { loadUiPrefs } from './slices/ui-slice';
import axiosInstance from '../shared/api/axios-instance';
import type { AppDispatch, RootState } from '.';
import type { Store } from '@reduxjs/toolkit';

interface UserPreferencesPayload {
  panels?: {
    showPalette?: boolean;
    showBlocks?: boolean;
    showProperties?: boolean;
    showMinimap?: boolean;
    showValidation?: boolean;
    showAiChat?: boolean;
    showCostPanel?: boolean;
    showTemplates?: boolean;
  };
  splitView?: RootState['ui']['splitView'];
  rootDirectory?: string | null;
  expandedFolders?: string[];
}

let _hydrated = false;
let _saveTimeout: ReturnType<typeof setTimeout> | null = null;
let _lastSavedSerialized = '';
let _saveInFlight = false;

function extractPayload(state: RootState): UserPreferencesPayload {
  return {
    panels: {
      showPalette: state.ui.showPalette,
      showBlocks: state.ui.showBlocks,
      showProperties: state.ui.showProperties,
      showMinimap: state.ui.showMinimap,
      showValidation: state.ui.showValidation,
      showAiChat: state.ui.showAiChat,
      showCostPanel: state.ui.showCostPanel,
      showTemplates: state.ui.showTemplates,
    },
    splitView: state.ui.splitView,
    rootDirectory: state.projectList.rootDirectory,
    expandedFolders: state.projectList.expandedFolders,
  };
}

/**
 * Fetch the user's preferences and dispatch hydration actions into
 * the relevant slices. Safe to call multiple times — the slice
 * reducers skip null/undefined fields so a partial blob won't blow
 * away in-session changes.
 */
export async function hydrateUserPreferences(dispatch: AppDispatch): Promise<void> {
  try {
    const res = await axiosInstance.get<UserPreferencesPayload | null>('/profile/preferences');
    const payload = res.data;
    if (payload && typeof payload === 'object') {
      dispatch(loadUiPrefs({ panels: payload.panels, splitView: payload.splitView }));
      dispatch(
        loadProjectListPrefs({
          rootDirectory: payload.rootDirectory ?? null,
          expandedFolders: payload.expandedFolders,
        }),
      );
    }
  } catch (err) {
    // Network / auth failures fall through to slice defaults — UX
    // degrades to "session-local prefs" but never crashes.
    console.warn('[user-preferences] hydrate failed:', err);
  } finally {
    // Mark hydrated AFTER dispatching so the auto-save subscriber
    // doesn't fire on the very actions we just dispatched (the
    // serialized-hash check would catch them anyway, but this is the
    // cleaner contract).
    _hydrated = true;
  }
}

async function savePreferences(payload: UserPreferencesPayload): Promise<void> {
  if (_saveInFlight) return;
  _saveInFlight = true;
  try {
    await axiosInstance.put('/profile/preferences', payload);
  } catch (err) {
    console.warn('[user-preferences] save failed:', err);
  } finally {
    _saveInFlight = false;
  }
}

/**
 * Install a debounced subscriber that saves preferences to the server
 * whenever the watched slice fields change. 800ms debounce — toggle
 * spam during a tour or panel-resize doesn't hammer the API.
 */
export function subscribeUserPreferencesAutoSave(store: Store<RootState>): () => void {
  return store.subscribe(() => {
    if (!_hydrated) return;
    if (_saveTimeout) clearTimeout(_saveTimeout);
    _saveTimeout = setTimeout(() => {
      const state = store.getState();
      const payload = extractPayload(state);
      const serialized = JSON.stringify(payload);
      if (serialized === _lastSavedSerialized) return;
      _lastSavedSerialized = serialized;
      void savePreferences(payload);
    }, 800);
  });
}

/** @internal — test-only reset hook. */
export function __resetUserPreferencesState(): void {
  _hydrated = false;
  _lastSavedSerialized = '';
  _saveInFlight = false;
  if (_saveTimeout) {
    clearTimeout(_saveTimeout);
    _saveTimeout = null;
  }
}
