/**
 * Unit tests for `services/deploy/src/utils/deploy-outcome.ts` — the
 * pure outcome computation helpers extracted in rf-deploy-2 from the
 * deploy.service.ts orchestrator. Existing high-level coverage of
 * `computeCompleteTotals` and `deriveCompleteOutcome` is in
 * `__tests__/deploy-event-translation.test.ts`; this file targets the
 * missing branches (skip action, undefined input, partial outcome,
 * computeDeploySummary action variants) so the new module hits ≥90% on
 * statement and branch.
 *
 * Per the `deploy-service-tests-must-import-vitest-explicitly` learning,
 * vitest globals are imported explicitly so the deploy package's
 * typecheck pass stays green.
 */

import { describe, it, expect } from 'vitest';
import { computeCompleteTotals, computeDeploySummary, deriveCompleteOutcome } from '../deploy-outcome';

describe('computeCompleteTotals', () => {
  it('returns zero counts for undefined input', () => {
    const totals = computeCompleteTotals(undefined);
    expect(totals).toEqual({
      queued: 0,
      applying: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      cancelled: 0,
    });
  });

  it('returns zero counts for empty array', () => {
    const totals = computeCompleteTotals([]);
    expect(totals.succeeded).toBe(0);
    expect(totals.failed).toBe(0);
    expect(totals.skipped).toBe(0);
    expect(totals.cancelled).toBe(0);
  });

  it('counts succeeded resources regardless of action', () => {
    const totals = computeCompleteTotals([
      { success: true, action: 'create' },
      { success: true, action: 'update' },
      { success: true, action: 'delete' },
    ]);
    expect(totals.succeeded).toBe(3);
    expect(totals.failed).toBe(0);
  });

  it('counts skip-action failures as skipped, not failed', () => {
    const totals = computeCompleteTotals([
      { success: false, action: 'skip' },
      { success: false, action: 'skip', error: '' },
    ]);
    expect(totals.skipped).toBe(2);
    expect(totals.failed).toBe(0);
  });

  it('routes cancelled-due-to-dep regex matches into cancelled bucket', () => {
    const totals = computeCompleteTotals([
      { success: false, action: 'create', error: 'cancelled-due-to-dep' },
      { success: false, action: 'create', error: 'CANCELLED at 12:00' },
    ]);
    expect(totals.cancelled).toBe(2);
    expect(totals.failed).toBe(0);
  });

  it('treats missing error string as a real failure (not cancelled)', () => {
    const totals = computeCompleteTotals([
      { success: false, action: 'create' },
      { success: false, action: 'create', error: undefined },
    ]);
    expect(totals.failed).toBe(2);
    expect(totals.cancelled).toBe(0);
  });

  it('ignores entries with success neither true nor false', () => {
    // The reducer only acts on explicit true/false. A row with `success:
    // null` (or absent) shouldn't bump any counter — protects the rollup
    // from in-flight rows when the result snapshot is read mid-deploy.
    const totals = computeCompleteTotals([{ success: null, action: 'create' }, { action: 'create' }]);
    expect(totals.succeeded).toBe(0);
    expect(totals.failed).toBe(0);
    expect(totals.cancelled).toBe(0);
    expect(totals.skipped).toBe(0);
  });

  it('handles a mixed batch with every category at once', () => {
    const totals = computeCompleteTotals([
      { success: true, action: 'create' },
      { success: false, action: 'create', error: 'real failure' },
      { success: false, action: 'skip' },
      { success: false, action: 'create', error: 'cancelled-due-to-dep' },
    ]);
    expect(totals.succeeded).toBe(1);
    expect(totals.failed).toBe(1);
    expect(totals.skipped).toBe(1);
    expect(totals.cancelled).toBe(1);
  });

  it('tolerates null entries inside the resource list', () => {
    // Optional-chaining on `r?.success` means a null/undefined row
    // shouldn't throw — it just contributes nothing.
    const totals = computeCompleteTotals([null as any, undefined as any, { success: true }]);
    expect(totals.succeeded).toBe(1);
    expect(totals.failed).toBe(0);
  });
});

describe('deriveCompleteOutcome', () => {
  it('returns "success" when every resource succeeded', () => {
    expect(
      deriveCompleteOutcome([
        { success: true, action: 'create' },
        { success: true, action: 'update' },
      ]),
    ).toBe('success');
  });

  it('returns "failure" when every resource failed', () => {
    expect(
      deriveCompleteOutcome([
        { success: false, action: 'create', error: 'boom' },
        { success: false, action: 'create', error: 'boom2' },
      ]),
    ).toBe('failure');
  });

  it('returns "partial" when some succeeded and some failed', () => {
    expect(
      deriveCompleteOutcome([
        { success: true, action: 'create' },
        { success: false, action: 'create', error: 'boom' },
      ]),
    ).toBe('partial');
  });

  it('returns "cancelled" when cancel flag fired AND no success', () => {
    expect(deriveCompleteOutcome([], { cancelled: true })).toBe('cancelled');
  });

  it('returns "cancelled" when cancel flag fired with only failures (no success)', () => {
    expect(deriveCompleteOutcome([{ success: false, action: 'create', error: 'boom' }], { cancelled: true })).toBe(
      'cancelled',
    );
  });

  it('returns "partial" when cancel flag fired but a resource already succeeded', () => {
    // The user has a real artifact even after the abort — surfacing
    // `partial` (not `cancelled`) tells them they need to clean up.
    expect(
      deriveCompleteOutcome(
        [
          { success: true, action: 'create' },
          { success: false, action: 'create', error: 'cancelled-due-to-dep' },
        ],
        { cancelled: true },
      ),
    ).toBe('partial');
  });

  it('returns "cancelled" when every non-success looks cancelled and cancel flag is unset', () => {
    // The second cancel branch: no explicit cancel signal, but every
    // failure is a cancelled-due-to-dep sentinel. Treated as cancelled
    // so the UI doesn't flag it as a quality regression.
    expect(
      deriveCompleteOutcome([
        { success: false, action: 'create', error: 'cancelled-due-to-dep' },
        { success: false, action: 'create', error: 'cancelled-due-to-dep' },
      ]),
    ).toBe('cancelled');
  });

  it('does NOT return "cancelled" when only some non-successes look cancelled', () => {
    // If some failures are cancelled-due-to-dep but at least one is a
    // real error, the deploy did fail — don't paper over it.
    expect(
      deriveCompleteOutcome([
        { success: false, action: 'create', error: 'cancelled-due-to-dep' },
        { success: false, action: 'create', error: 'real failure' },
      ]),
    ).toBe('failure');
  });

  it('returns "success" for empty resources when engineSuccess is true', () => {
    expect(deriveCompleteOutcome([], { engineSuccess: true })).toBe('success');
  });

  it('returns "failure" for empty resources when engineSuccess is false or missing', () => {
    expect(deriveCompleteOutcome([], { engineSuccess: false })).toBe('failure');
    expect(deriveCompleteOutcome([])).toBe('failure');
  });

  it('returns "failure" for undefined resources without flags (no-op default)', () => {
    expect(deriveCompleteOutcome(undefined)).toBe('failure');
  });

  it('returns "success" for undefined resources when engineSuccess is true', () => {
    expect(deriveCompleteOutcome(undefined, { engineSuccess: true })).toBe('success');
  });

  it('treats missing error as not-cancelled in the second cancel branch', () => {
    // Empty / missing error strings shouldn't trip the
    // cancelled-due-to-dep regex, even with no successes.
    expect(
      deriveCompleteOutcome([
        { success: false, action: 'create' },
        { success: false, action: 'create', error: '' },
      ]),
    ).toBe('failure');
  });
});

describe('computeDeploySummary', () => {
  it('returns all zeros for undefined result', () => {
    const summary = computeDeploySummary(undefined);
    expect(summary).toEqual({ created: 0, updated: 0, deleted: 0, failed: 0, total: 0 });
  });

  it('returns all zeros when result has no resources field', () => {
    const summary = computeDeploySummary({});
    expect(summary).toEqual({ created: 0, updated: 0, deleted: 0, failed: 0, total: 0 });
  });

  it('counts create / update / delete actions on success', () => {
    const summary = computeDeploySummary({
      resources: [
        { success: true, action: 'create' },
        { success: true, action: 'update' },
        { success: true, action: 'delete' },
      ],
    });
    expect(summary).toEqual({ created: 1, updated: 1, deleted: 1, failed: 0, total: 3 });
  });

  it('defaults missing action to create', () => {
    // Older deployer rows omit `action` — the history UI used to render
    // them as "0 created · 1 unknown", which is wrong; the default is
    // create so the summary reflects what the engine actually did.
    const summary = computeDeploySummary({
      resources: [{ success: true }, { success: true, action: undefined }],
    });
    expect(summary.created).toBe(2);
    expect(summary.failed).toBe(0);
    expect(summary.total).toBe(2);
  });

  it('counts every non-success as a failure regardless of action', () => {
    const summary = computeDeploySummary({
      resources: [
        { success: false, action: 'create', error: 'boom' },
        { success: false, action: 'update', error: 'boom2' },
        { success: false, action: 'delete', error: 'cancelled-due-to-dep' },
      ],
    });
    expect(summary.failed).toBe(3);
    expect(summary.created).toBe(0);
    expect(summary.updated).toBe(0);
    expect(summary.deleted).toBe(0);
    expect(summary.total).toBe(3);
  });

  it('handles a mixed batch and surfaces correct total', () => {
    const summary = computeDeploySummary({
      resources: [
        { success: true, action: 'create' },
        { success: true, action: 'update' },
        { success: false, action: 'create', error: 'boom' },
      ],
    });
    expect(summary).toEqual({ created: 1, updated: 1, deleted: 0, failed: 1, total: 3 });
  });

  it('ignores unknown action values on success (counter stays zero)', () => {
    // Defensive: a future action value (e.g. 'replace') shouldn't bump
    // the legacy counters. Total still reflects the row was present.
    const summary = computeDeploySummary({
      resources: [{ success: true, action: 'replace' }],
    });
    expect(summary.created).toBe(0);
    expect(summary.updated).toBe(0);
    expect(summary.deleted).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.total).toBe(1);
  });
});
