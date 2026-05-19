/**
 * Unit tests for `services/deploy/src/services/deploy-lock-wrapper.ts` —
 * the narrow `acquireWriteLock` helper extracted in rf-deploy-8 from the
 * three throw-style lock-acquire callsites in `deploy.service.ts`
 * (destroyDeployment, destroyAllForCard, rollbackDeployment).
 *
 * Per the `deploy-service-tests-must-import-vitest-explicitly` learning,
 * vitest globals are imported explicitly so the deploy package's
 * typecheck pass stays green.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// `instanceof DeployLockError` is the branch this helper hinges on, so the
// mock has to expose a real class — a `vi.fn()` constructor stub wouldn't
// preserve the prototype chain. The class is declared INSIDE the factory
// because `vi.mock(...)` is hoisted above any top-level `class`/`let`
// bindings — declaring it outside triggers
// "Cannot access 'MockDeployLockError' before initialization".
vi.mock('../deploy-locks', () => {
  class MockDeployLockError extends Error {
    public code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = 'DeployLockError';
      this.code = code;
    }
  }
  return {
    acquireDeployLock: vi.fn(),
    DeployLockError: MockDeployLockError,
  };
});

import { acquireWriteLock } from '../deploy-lock-wrapper';
import * as deployLocks from '../deploy-locks';

const acquireDeployLockMock = (deployLocks as any).acquireDeployLock as ReturnType<typeof vi.fn>;
const MockDeployLockError = (deployLocks as any).DeployLockError as new (
  code: string,
  message: string,
) => Error & { code: string };

describe('acquireWriteLock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the release function from acquireDeployLock when the underlying call succeeds', () => {
    const release = vi.fn();
    acquireDeployLockMock.mockReturnValueOnce({ release, signal: new AbortController().signal });

    const result = acquireWriteLock('card-1', 'destroy');

    expect(result).toBe(release);
    // The wrapper should never invoke the release fn itself.
    expect(release).not.toHaveBeenCalled();
  });

  it('forwards cardId and action verbatim to acquireDeployLock', () => {
    const release = vi.fn();
    acquireDeployLockMock.mockReturnValueOnce({ release, signal: new AbortController().signal });

    acquireWriteLock('card-xyz', 'rollback');

    expect(acquireDeployLockMock).toHaveBeenCalledTimes(1);
    expect(acquireDeployLockMock).toHaveBeenCalledWith('card-xyz', 'rollback');
  });

  it('rethrows a non-DeployLockError verbatim (same instance, same message)', () => {
    const original = new Error('database is down');
    acquireDeployLockMock.mockImplementationOnce(() => {
      throw original;
    });

    let caught: unknown;
    try {
      acquireWriteLock('card-1', 'destroy');
    } catch (err) {
      caught = err;
    }
    // Same instance, not a wrapper.
    expect(caught).toBe(original);
    expect((caught as Error).message).toBe('database is down');
    expect(caught).not.toBeInstanceOf(MockDeployLockError);
  });

  it('wraps a DeployLockError as a plain Error with cause set to the original', () => {
    const original = new MockDeployLockError('DEPLOY_IN_FLIGHT', 'A destroy is already in progress for card card-1');
    acquireDeployLockMock.mockImplementationOnce(() => {
      throw original;
    });

    let caught: unknown;
    try {
      acquireWriteLock('card-1', 'destroy');
    } catch (err) {
      caught = err;
    }

    // The wrapped error is a fresh Error, not a DeployLockError — that's
    // the point of the helper (HTTP layer doesn't need to know about the
    // lock-error class name).
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(MockDeployLockError);
    expect((caught as Error).message).toBe('A destroy is already in progress for card card-1');
    expect((caught as Error).cause).toBe(original);
  });

  it.each<[string, 'destroy' | 'rollback']>([
    ['card-a', 'destroy'],
    ['card-b', 'rollback'],
  ])('round-trips both action values through to acquireDeployLock (%s, %s)', (cardId, action) => {
    const release = vi.fn();
    acquireDeployLockMock.mockReturnValueOnce({ release, signal: new AbortController().signal });

    const result = acquireWriteLock(cardId, action);

    expect(result).toBe(release);
    expect(acquireDeployLockMock).toHaveBeenCalledWith(cardId, action);
  });
});
