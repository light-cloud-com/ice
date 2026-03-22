/**
 * ICE State Module
 *
 * State persistence for resources, deployments, and locks.
 */

// State store interface and types
export type {
  StoredResourceState,
  DeploymentRecord,
  StateLock,
  StateSnapshot,
  ResourceQuery,
  DeploymentQuery,
  StateStore,
  StateChangeType,
  StateChangeEvent,
  StateChangeListener,
  ObservableStateStore,
} from './state-store.js';

// SQLite state store
export type { SqliteStateStoreOptions } from './sqlite-state-store.js';

export {
  SqliteStateStore,
  create_sqlite_state_store,
  create_memory_state_store,
} from './sqlite-state-store.js';
