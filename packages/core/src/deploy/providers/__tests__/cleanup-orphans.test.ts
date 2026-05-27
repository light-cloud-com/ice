/**
 * Unit tests for the cleanup-orphans `isOrphan` filter logic shared by
 * the AWS + Azure cleanup scripts under `e2e/`.
 *
 * Both scripts share the same shape: an in-memory `Map<runId, Date>`
 * built from per-run JSONL audit files, plus an `ORPHAN_AGE_HOURS`
 * constant. The filter declares a run an orphan when:
 *   - runId is absent from the register (the JSONL was never written
 *     or has been deleted manually), OR
 *   - the last event timestamp is at least ORPHAN_AGE_HOURS old.
 *
 * Both scripts must use the same threshold so cross-cloud cleanups
 * behave consistently. The test pins that invariant.
 */

import { describe, expect, it } from 'vitest';
import {
  isOrphan as isOrphanAws,
  ORPHAN_AGE_HOURS as AWS_HOURS,
  TAG_KEY as AWS_TAG,
} from '../../../../../../e2e/aws-deployment-tests/cleanup-orphans';
import {
  isOrphan as isOrphanAzure,
  ORPHAN_AGE_HOURS as AZURE_HOURS,
  TAG_KEY as AZURE_TAG,
} from '../../../../../../e2e/azure-deployment-tests/cleanup-orphans';

describe('cleanup-orphans — shared tag + age constants', () => {
  it('AWS + Azure scripts use the same orphan-age threshold', () => {
    expect(AWS_HOURS).toBe(AZURE_HOURS);
  });

  it('AWS + Azure scripts use the same tag key', () => {
    expect(AWS_TAG).toBe(AZURE_TAG);
    expect(AWS_TAG).toBe('ice:test-run-id');
  });
});

describe('cleanup-orphans — isOrphan filter (AWS variant)', () => {
  it("treats unknown runId as orphan (no JSONL means we can't prove it's recent)", () => {
    expect(isOrphanAws('unknown-run', new Map())).toBe(true);
  });

  it('treats a fresh runId (within the window) as NOT orphan', () => {
    const now = new Date('2026-05-27T12:00:00Z');
    const register = new Map([['fresh', new Date('2026-05-27T11:55:00Z')]]);
    expect(isOrphanAws('fresh', register, now)).toBe(false);
  });

  it('treats a runId older than ORPHAN_AGE_HOURS as orphan', () => {
    const now = new Date('2026-05-27T12:00:00Z');
    const register = new Map([['stale', new Date('2026-05-26T10:00:00Z')]]);
    expect(isOrphanAws('stale', register, now)).toBe(true);
  });
});

describe('cleanup-orphans — isOrphan filter (Azure variant)', () => {
  it('treats unknown runId as orphan', () => {
    expect(isOrphanAzure('unknown-run', new Map())).toBe(true);
  });

  it('treats a fresh runId as NOT orphan', () => {
    const now = new Date('2026-05-27T12:00:00Z');
    const register = new Map([['fresh', new Date('2026-05-27T11:55:00Z')]]);
    expect(isOrphanAzure('fresh', register, now)).toBe(false);
  });

  it('treats a stale runId as orphan', () => {
    const now = new Date('2026-05-27T12:00:00Z');
    const register = new Map([['stale', new Date('2026-05-26T10:00:00Z')]]);
    expect(isOrphanAzure('stale', register, now)).toBe(true);
  });
});
