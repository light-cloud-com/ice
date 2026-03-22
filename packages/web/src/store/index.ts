/**
 * Redux Store Configuration
 *
 * Sets up the Redux store with all slices and middleware.
 * Web version: debounced auto-save to backend API instead of localStorage.
 */

import { configureStore, type Middleware } from '@reduxjs/toolkit';
import { logStateChange } from '../shared/utils/action-logger';
import graphReducer from './slices/graph-slice';
import uiReducer from './slices/ui-slice';
import selectionReducer from './slices/selection-slice';
import viewReducer from './slices/view-slice';
import cardsReducer from './slices/cards-slice';
import projectListReducer from './slices/project-list-slice';
import projectsReducer from './slices/projects-slice';
import debugReducer from './slices/debug-slice';
import deployReducer from './slices/deploy-slice';
import integrationsReducer from './slices/integrations-slice';
import accountReducer from './slices/account-slice';
import aiReducer from './slices/ai-slice';
import pipelineReducer from './slices/pipeline-slice';
import environmentsReducer from './slices/environments-slice';
import onboardingReducer from './slices/onboarding-slice';

// Action logger middleware — logs significant Redux dispatches for E2E observability
const LOGGED_ACTION_PREFIXES = [
  'deploy/', 'account/', 'integrations/', 'environments/', 'pipeline/',
  'onboarding/', 'ai/', 'projects/',
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
    onboarding: onboardingReducer,
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
  // Quick hash: node count + edge count + first/last node ID
  if (!card) return '';
  const n = card.nodes || [];
  const e = card.edges || [];
  return `${card.id}:${n.length}:${e.length}:${n[0]?.id || ''}:${n[n.length - 1]?.id || ''}:${n[n.length - 1]?.position?.x || 0}`;
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
        localStorage.setItem('ice-cards', JSON.stringify({
          cards: state.cards.cards,
          activeCardId,
        }));
      } catch { /* ignore quota errors */ }

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

// Also persist UI pane state to localStorage (lightweight, no API needed)
let _uiPersistTimeout: ReturnType<typeof setTimeout>;
store.subscribe(() => {
  clearTimeout(_uiPersistTimeout);
  _uiPersistTimeout = setTimeout(() => {
    try {
      const state = store.getState();
      localStorage.setItem('ice-ui-panes', JSON.stringify(state.ui.splitView));
    } catch {
      /* ignore quota errors */
    }
  }, 300);
});

// Infer types from store
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
