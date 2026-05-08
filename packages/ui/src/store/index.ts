/**
 * Redux Store Configuration
 *
 * Sets up the Redux store with all slices and middleware.
 * Web version: debounced auto-save to backend API instead of localStorage.
 */

import { configureStore, type Middleware } from '@reduxjs/toolkit';
import accountReducer from './slices/account-slice';
import aiReducer from './slices/ai-slice';
import cardsReducer from './slices/cards-slice';
import debugReducer from './slices/debug-slice';
import deployReducer from './slices/deploy-slice';
import environmentsReducer from './slices/environments-slice';
import ghostsReducer from './slices/ghost-slice';
import graphReducer from './slices/graph-slice';
import integrationsReducer from './slices/integrations-slice';
import logsReducer from './slices/logs-slice';
import onboardingReducer from './slices/onboarding-slice';
import pipelineReducer from './slices/pipeline-slice';
import projectListReducer from './slices/project-list-slice';
import projectsReducer from './slices/projects-slice';
import selectionReducer from './slices/selection-slice';
import tourReducer from '../features/tour/store/tour-slice';
import uiReducer from './slices/ui-slice';
import validationReducer from './slices/validation-slice';
import viewReducer from './slices/view-slice';
import { logStateChange } from '../shared/utils/action-logger';

// Action logger middleware — logs significant Redux dispatches for E2E observability
const LOGGED_ACTION_PREFIXES = [
  'deploy/',
  'account/',
  'integrations/',
  'environments/',
  'pipeline/',
  'onboarding/',
  'ai/',
  'projects/',
  'tour/',
];
const actionLoggerMiddleware: Middleware = () => (next) => (action: any) => {
  const type = action?.type || '';
  if (LOGGED_ACTION_PREFIXES.some((p) => type.startsWith(p))) {
    logStateChange(type, action.payload);
  }
  return next(action);
};

export const store = configureStore({
  reducer: {
    graph: graphReducer,
    ui: uiReducer,
    selection: selectionReducer,
    view: viewReducer,
    cards: cardsReducer,
    projectList: projectListReducer,
    projects: projectsReducer,
    debug: debugReducer,
    deploy: deployReducer,
    integrations: integrationsReducer,
    account: accountReducer,
    ai: aiReducer,
    pipeline: pipelineReducer,
    environments: environmentsReducer,
    ghosts: ghostsReducer,
    logs: logsReducer,
    onboarding: onboardingReducer,
    tour: tourReducer,
    validation: validationReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(actionLoggerMiddleware),
});

// Debounced auto-save: persist active card to localStorage + backend
// Only saves when card data actually changes (dirty check via snapshot hash)
let _persistTimeout: ReturnType<typeof setTimeout>;
let _lastSavedHash = '';
let _backendSaveInFlight = false;

function cardHash(card: any): string {
  // Quick hash: node count + edge count + first/last node ID + a stable
  // serialization of every node's `data` blob. The data fingerprint is
  // critical: per-node settings (streamingMode, sourceNodeIdOverride, and
  // anything else that lives entirely under `node.data`) only mutate
  // `node.data` — none of the structural fields above change, so without
  // hashing data we'd skip the persistence write and lose the value on
  // reload. JSON.stringify is good enough; immer keeps key insertion
  // order stable for unchanged subtrees.
  if (!card) return '';
  const n = card.nodes || [];
  const e = card.edges || [];
  let dataFp = '';
  for (let i = 0; i < n.length; i++) {
    dataFp += JSON.stringify(n[i]?.data ?? {});
    dataFp += '|';
  }
  return `${card.id}:${n.length}:${e.length}:${n[0]?.id || ''}:${n[n.length - 1]?.id || ''}:${n[n.length - 1]?.position?.x || 0}:${dataFp}`;
}

store.subscribe(() => {
  clearTimeout(_persistTimeout);
  _persistTimeout = setTimeout(async () => {
    try {
      const state = store.getState();
      const activeCardId = state.cards.activeCardId;
      if (!activeCardId) return;

      const activeCard = state.cards.cards.find((c: any) => c.id === activeCardId);
      if (!activeCard) return;

      // Skip if nothing changed
      const hash = cardHash(activeCard);
      if (hash === _lastSavedHash) return;
      _lastSavedHash = hash;

      // Always persist to localStorage (works offline, before auth)
      try {
        localStorage.setItem(
          'ice-cards',
          JSON.stringify({
            cards: state.cards.cards,
            activeCardId,
          }),
        );
      } catch {
        /* ignore quota errors */
      }

      // Persist to backend if authenticated (skip if previous save still in flight)
      if (_backendSaveInFlight) return;

      const { getApi } = await import('../shared/api/api-adapter');
      const { isAuthenticated } = await import('../shared/api/auth');

      if (!isAuthenticated()) return;

      _backendSaveInFlight = true;
      try {
        const api = getApi();
        await api.graph.save(activeCardId);
      } finally {
        _backendSaveInFlight = false;
      }
    } catch {
      _backendSaveInFlight = false;
    }
  }, 2000);
});

// FE-5: Persist UI pane state with shallow comparison to skip no-ops
let _uiPersistTimeout: ReturnType<typeof setTimeout>;
let _lastUiSplitView: any = null;
store.subscribe(() => {
  const splitView = store.getState().ui.splitView;
  if (splitView === _lastUiSplitView) return; // skip if unchanged
  _lastUiSplitView = splitView;

  clearTimeout(_uiPersistTimeout);
  _uiPersistTimeout = setTimeout(() => {
    try {
      localStorage.setItem('ice-ui-panes', JSON.stringify(splitView));
    } catch {
      /* ignore quota errors */
    }
  }, 300);
});

// Infer types from store
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
