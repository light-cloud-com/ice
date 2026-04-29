/**
 * Deploy lock wrapper — narrow helper for the *throw-style* lock-acquire
 * callsites in `deploy.service.ts`.
 *
 * Three near-identical try/catch blocks (`destroyDeployment`,
 * `destroyAllForCard`, `rollbackDeployment`) all wrap
 * `acquireDeployLock(cardId, action).release` and convert a
 * `DeployLockError` to a regular `Error(msg, { cause })`. This module dedups
 * exactly that pattern.
 *
 * **Why apply isn't subsumed.** `applyDeployment`'s lock-acquire path also
 * needs the AbortSignal (not just the release fn) AND it returns
 * `{ success: false, error, code }` on `DeployLockError` instead of
 * throwing. Forcing both shapes through one helper would either bloat the
 * API (apply-only options) or smuggle business logic into a module whose
 * job is purely "convert this error type". The blueprint's broader
 * `withDeployLock<T>` got narrowed to this `acquireWriteLock` for that
 * reason — see `.claude/state/blueprints/rf-deploy.md` line 97.
 */

import { acquireDeployLock, DeployLockError } from './deploy-locks.js';

/**
 * Acquire a per-card deploy lock for `action`, returning the release fn.
 *
 * On `DeployLockError`, rethrows as `Error(err.message, { cause: err })` so
 * the upstream HTTP layer surfaces the human-readable conflict message
 * without leaking the lock-error's class name. Any other error is rethrown
 * verbatim.
 */
export function acquireWriteLock(cardId: string, action: 'destroy' | 'rollback'): () => void {
  try {
    return acquireDeployLock(cardId, action).release;
  } catch (err) {
    if (err instanceof DeployLockError) throw new Error(err.message, { cause: err });
    throw err;
  }
}
