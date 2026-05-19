/**
 * Tests for `cloud-storage/public-access-granter.ts` (rf-cstor-4).
 * Covers the IAM → legacy-ACL fallback used by both create() (with
 * verifyAfterWrite=false) and update() (with verifyAfterWrite=true).
 *
 * RISK pins:
 *   #4 IAM merge-not-replace (preserve etag/version + existing bindings)
 *   #5 UBLA-forced + IAM-blocked dual block short-circuits ACL
 *   #6 ACL dual calls (default.add + acl.add best-effort)
 *   #7 verifyAfterWrite=true detects silent strip; =false skips re-fetch
 */

import { describe, it, expect, vi } from 'vitest';
import { grantPublicAccess } from '../public-access-granter';
import type { GCPHandlerContext } from '../../../types';

function makeCtx(): { ctx: GCPHandlerContext; logs: string[] } {
  const logs: string[] = [];
  const ctx = {
    clients: { get: () => null } as any,
    on_log: (m: string) => logs.push(m),
  } as unknown as GCPHandlerContext;
  return { ctx, logs };
}

function makeBucket(overrides: Record<string, any> = {}): any {
  // Build defaults then merge per-test overrides into each sub-shape.
  // A naive `{ ...defaults, ...overrides }` would replace `iam` wholesale,
  // dropping the default `setPolicy` mock when a test only customizes
  // `getPolicy`.
  const iamDefault = {
    getPolicy: vi.fn().mockResolvedValue([{ bindings: [], etag: 'e0', version: 3 }]),
    setPolicy: vi.fn().mockResolvedValue(undefined),
  };
  const aclDefault = {
    default: { add: vi.fn().mockResolvedValue(undefined) },
    add: vi.fn().mockResolvedValue(undefined),
  };
  return {
    iam: { ...iamDefault, ...(overrides.iam || {}) },
    acl: {
      default: { ...aclDefault.default, ...((overrides.acl || {}).default || {}) },
      add: (overrides.acl || {}).add || aclDefault.add,
    },
  };
}

describe('cloud-storage/public-access-granter', () => {
  describe('IAM grant success (create-mode, verifyAfterWrite=false)', () => {
    it('grants allUsers via IAM with no fallback (clean path)', async () => {
      const bucket = makeBucket();
      const { ctx, logs } = makeCtx();
      const out = await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: false });
      expect(out).toEqual({ strategy: 'iam', failed: false, error: '', warnings: [] });
      expect(bucket.iam.setPolicy).toHaveBeenCalledTimes(1);
      // No re-fetch when verifyAfterWrite=false (RISK #7).
      expect(bucket.iam.getPolicy).toHaveBeenCalledTimes(1);
      expect(logs.some((l) => l.includes('Granted allUsers:objectViewer via IAM'))).toBe(true);
    });

    it('preserves existing bindings (RISK #4: merge not replace)', async () => {
      // Existing roles/storage.objectAdmin binding for the service account
      // must survive — replacing the policy would leave the bucket
      // inaccessible.
      const existingPolicy = {
        etag: 'eABC',
        version: 1,
        bindings: [
          { role: 'roles/storage.objectAdmin', members: ['serviceAccount:sa@p.iam'] },
          { role: 'roles/storage.legacyBucketReader', members: ['user:owner@example.com'] },
        ],
      };
      const bucket = makeBucket({ iam: { getPolicy: vi.fn().mockResolvedValue([existingPolicy]) } });
      const { ctx } = makeCtx();
      await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: false });
      const setArg = bucket.iam.setPolicy.mock.calls[0][0];
      // Etag echoed back to lock against concurrent writers.
      expect(setArg.etag).toBe('eABC');
      // Version echoed back; here the policy was version 1, so we keep 1.
      expect(setArg.version).toBe(1);
      // Existing bindings are preserved + new objectViewer:allUsers appended.
      expect(setArg.bindings).toContainEqual({ role: 'roles/storage.objectAdmin', members: ['serviceAccount:sa@p.iam'] });
      expect(setArg.bindings).toContainEqual({ role: 'roles/storage.legacyBucketReader', members: ['user:owner@example.com'] });
      expect(setArg.bindings).toContainEqual({ role: 'roles/storage.objectViewer', members: ['allUsers'] });
    });

    it('appends allUsers to existing objectViewer binding instead of duplicating', async () => {
      const policy = {
        etag: 'e2',
        version: 3,
        bindings: [
          { role: 'roles/storage.objectViewer', members: ['user:reader@example.com'] },
        ],
      };
      const bucket = makeBucket({ iam: { getPolicy: vi.fn().mockResolvedValue([policy]) } });
      const { ctx } = makeCtx();
      await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: false });
      const setArg = bucket.iam.setPolicy.mock.calls[0][0];
      const viewer = setArg.bindings.find((b: any) => b.role === 'roles/storage.objectViewer');
      expect(viewer.members).toEqual(['user:reader@example.com', 'allUsers']);
      // The original objectViewer binding wasn't duplicated.
      expect(setArg.bindings.filter((b: any) => b.role === 'roles/storage.objectViewer').length).toBe(1);
    });

    it('defaults version to 3 when policy is null (getPolicy rejected)', async () => {
      const bucket = makeBucket({ iam: { getPolicy: vi.fn().mockRejectedValue(new Error('rate-limited')) } });
      const { ctx } = makeCtx();
      const out = await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: false });
      expect(out.strategy).toBe('iam');
      expect(bucket.iam.setPolicy.mock.calls[0][0].version).toBe(3);
      expect(bucket.iam.setPolicy.mock.calls[0][0].etag).toBeUndefined();
    });

    it('defaults version to 3 when currentPolicy.version is missing', async () => {
      const policy = { etag: 'e3', bindings: [] };
      const bucket = makeBucket({ iam: { getPolicy: vi.fn().mockResolvedValue([policy]) } });
      const { ctx } = makeCtx();
      await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: false });
      expect(bucket.iam.setPolicy.mock.calls[0][0].version).toBe(3);
    });

    it('handles a policy with no bindings array (treats as empty)', async () => {
      const bucket = makeBucket({ iam: { getPolicy: vi.fn().mockResolvedValue([{ etag: 'e' }]) } });
      const { ctx } = makeCtx();
      const out = await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: false });
      expect(out.strategy).toBe('iam');
      const setArg = bucket.iam.setPolicy.mock.calls[0][0];
      expect(setArg.bindings).toEqual([{ role: 'roles/storage.objectViewer', members: ['allUsers'] }]);
    });
  });

  describe('IAM fast-path (allUsers already bound)', () => {
    it('returns strategy=iam without calling setPolicy', async () => {
      const policy = {
        etag: 'e4',
        version: 3,
        bindings: [{ role: 'roles/storage.objectViewer', members: ['allUsers', 'user:other@example.com'] }],
      };
      const bucket = makeBucket({ iam: { getPolicy: vi.fn().mockResolvedValue([policy]) } });
      const { ctx } = makeCtx();
      const out = await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: false });
      expect(out.strategy).toBe('iam');
      expect(bucket.iam.setPolicy).not.toHaveBeenCalled();
    });
  });

  describe('IAM verify path (update-mode, verifyAfterWrite=true)', () => {
    it('verifies the policy after setPolicy and reports success on landed grant', async () => {
      const before = { etag: 'e5', version: 3, bindings: [] };
      const after = {
        etag: 'e6',
        version: 3,
        bindings: [{ role: 'roles/storage.objectViewer', members: ['allUsers'] }],
      };
      const bucket = makeBucket({
        iam: {
          getPolicy: vi.fn().mockResolvedValueOnce([before]).mockResolvedValueOnce([after]),
        },
      });
      const { ctx, logs } = makeCtx();
      const out = await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: true });
      expect(out.strategy).toBe('iam');
      expect(bucket.iam.getPolicy).toHaveBeenCalledTimes(2);
      expect(logs.some((l) => l.includes('✓ Granted allUsers:objectViewer via IAM'))).toBe(true);
    });

    it('detects silent stripping (verify returns policy without allUsers) and stashes iamGrantError', async () => {
      const before = { etag: 'e7', version: 3, bindings: [] };
      // Simulated org policy stripped allUsers post-write.
      const after = { etag: 'e8', version: 3, bindings: [] };
      const bucket = makeBucket({
        iam: {
          getPolicy: vi.fn().mockResolvedValueOnce([before]).mockResolvedValueOnce([after]),
        },
      });
      const { ctx } = makeCtx();
      // No UBLA-forced, so the helper falls through to the ACL fallback.
      const out = await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: true });
      // ACL fallback ran and succeeded.
      expect(out.strategy).toBe('legacy-acl');
      expect(bucket.acl.default.add).toHaveBeenCalled();
    });

    it('skips re-fetch entirely when verifyAfterWrite=false (RISK #7)', async () => {
      const policy = { etag: 'e9', version: 3, bindings: [] };
      const bucket = makeBucket({ iam: { getPolicy: vi.fn().mockResolvedValue([policy]) } });
      const { ctx } = makeCtx();
      await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: false });
      // Only one getPolicy call — the initial fetch, not a verify.
      expect(bucket.iam.getPolicy).toHaveBeenCalledTimes(1);
    });

    it('treats a stripped policy with verifyAfterWrite=true under UBLA-forced as failed', async () => {
      // Stripped + ublaForcedOn → ACL is unavailable → both strategies dead.
      const before = { etag: 'e10', version: 3, bindings: [] };
      const after = { etag: 'e11', version: 3, bindings: [] };
      const bucket = makeBucket({
        iam: {
          getPolicy: vi.fn().mockResolvedValueOnce([before]).mockResolvedValueOnce([after]),
        },
      });
      const { ctx } = makeCtx();
      const out = await grantPublicAccess(bucket, 'b', true, ctx, { verifyAfterWrite: true });
      expect(out.failed).toBe(true);
      expect(out.error).toContain('IAM setPolicy returned success');
      expect(out.error).toContain('ACL fallback unavailable');
    });
  });

  describe('UBLA-forced + IAM-blocked short-circuit (RISK #5)', () => {
    it('does NOT call acl.default.add when ublaForcedOn=true and IAM rejects', async () => {
      const bucket = makeBucket({
        iam: { setPolicy: vi.fn().mockRejectedValue(new Error('permitted customer error')) },
      });
      const { ctx } = makeCtx();
      const out = await grantPublicAccess(bucket, 'b', true, ctx, { verifyAfterWrite: false });
      expect(out.failed).toBe(true);
      expect(out.strategy).toBe('none');
      expect(bucket.acl.default.add).not.toHaveBeenCalled();
      expect(out.error).toContain('ACL fallback unavailable');
      expect(out.warnings.length).toBeGreaterThan(0);
      expect(out.warnings[0]).toContain('BOTH public access strategies blocked');
    });
  });

  describe('IAM blocked → legacy ACL fallback (RISK #6)', () => {
    it('calls BOTH acl.default.add and acl.add (best-effort) and reports legacy-acl', async () => {
      const bucket = makeBucket({
        iam: { setPolicy: vi.fn().mockRejectedValue(new Error('permitted customer error')) },
      });
      const { ctx, logs } = makeCtx();
      const out = await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: false });
      expect(out.strategy).toBe('legacy-acl');
      expect(out.failed).toBe(false);
      expect(bucket.acl.default.add).toHaveBeenCalledWith({ entity: 'allUsers', role: 'READER' });
      expect(bucket.acl.add).toHaveBeenCalledWith({ entity: 'allUsers', role: 'READER' });
      expect(logs.some((l) => l.includes('✓ Legacy ACL fallback worked'))).toBe(true);
    });

    it('still reports legacy-acl when bucket-level acl.add rejects (best-effort)', async () => {
      // The acl.add() call is `.catch(() => undefined)` — its failure
      // must NOT propagate.
      const bucket = makeBucket({
        iam: { setPolicy: vi.fn().mockRejectedValue(new Error('permitted customer')) },
        acl: {
          default: { add: vi.fn().mockResolvedValue(undefined) },
          add: vi.fn().mockRejectedValue(new Error('bucket-level ACL not supported')),
        },
      });
      const { ctx } = makeCtx();
      const out = await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: false });
      expect(out.strategy).toBe('legacy-acl');
      expect(out.failed).toBe(false);
    });

    it('detects org-policy block via "permitted customer" string in IAM error', async () => {
      const bucket = makeBucket({
        iam: { setPolicy: vi.fn().mockRejectedValue(new Error('permitted customer policy violation')) },
      });
      const { ctx, logs } = makeCtx();
      await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: false });
      expect(logs.some((l) => l.includes('IAM allUsers grant blocked by org policy'))).toBe(true);
    });

    it('detects org-policy block via "allowedPolicyMemberDomains" string in IAM error', async () => {
      const bucket = makeBucket({
        iam: { setPolicy: vi.fn().mockRejectedValue(new Error('iam.allowedPolicyMemberDomains constraint')) },
      });
      const { ctx, logs } = makeCtx();
      await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: false });
      expect(logs.some((l) => l.includes('IAM allUsers grant blocked by org policy'))).toBe(true);
    });

    it('detects org-policy block via "stripped" string (update-mode silent strip)', async () => {
      const before = { etag: 'eA', version: 3, bindings: [] };
      const after = { etag: 'eB', version: 3, bindings: [] };
      const bucket = makeBucket({
        iam: {
          getPolicy: vi.fn().mockResolvedValueOnce([before]).mockResolvedValueOnce([after]),
        },
      });
      const { ctx, logs } = makeCtx();
      await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: true });
      expect(logs.some((l) => l.includes('IAM allUsers grant blocked by org policy'))).toBe(true);
    });

    it('uses the "IAM grant failed" log path for non-org-policy errors', async () => {
      const bucket = makeBucket({
        iam: { setPolicy: vi.fn().mockRejectedValue(new Error('network timeout')) },
      });
      const { ctx, logs } = makeCtx();
      await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: false });
      expect(logs.some((l) => l.includes('IAM grant failed on b: network timeout'))).toBe(true);
    });
  });

  describe('IAM blocked → legacy ACL ALSO blocked', () => {
    it('marks failed and warns about access prevention (publicAccessPrevention error)', async () => {
      const bucket = makeBucket({
        iam: { setPolicy: vi.fn().mockRejectedValue(new Error('iam.allowedPolicyMemberDomains')) },
        acl: {
          default: { add: vi.fn().mockRejectedValue(new Error('publicAccessPrevention enforced')) },
          add: vi.fn().mockResolvedValue(undefined),
        },
      });
      const { ctx } = makeCtx();
      const out = await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: false });
      expect(out.failed).toBe(true);
      expect(out.strategy).toBe('none');
      expect(out.error).toContain('IAM:');
      expect(out.error).toContain('ACL fallback:');
      expect(out.warnings[0]).toContain('BOTH public access strategies blocked');
    });

    it('detects access-prevention via "PUBLIC_ACCESS_PREVENTION" string', async () => {
      const bucket = makeBucket({
        iam: { setPolicy: vi.fn().mockRejectedValue(new Error('permitted customer')) },
        acl: {
          default: { add: vi.fn().mockRejectedValue(new Error('PUBLIC_ACCESS_PREVENTION_ENFORCED')) },
          add: vi.fn().mockResolvedValue(undefined),
        },
      });
      const { ctx } = makeCtx();
      const out = await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: false });
      expect(out.warnings[0]).toContain('BOTH public access strategies blocked');
    });

    it('detects access-prevention via "uniform bucket-level access" string', async () => {
      const bucket = makeBucket({
        iam: { setPolicy: vi.fn().mockRejectedValue(new Error('permitted customer')) },
        acl: {
          default: { add: vi.fn().mockRejectedValue(new Error('uniform bucket-level access required')) },
          add: vi.fn().mockResolvedValue(undefined),
        },
      });
      const { ctx } = makeCtx();
      const out = await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: false });
      expect(out.warnings[0]).toContain('BOTH public access strategies blocked');
    });

    it('detects access-prevention via "UBLA" string', async () => {
      const bucket = makeBucket({
        iam: { setPolicy: vi.fn().mockRejectedValue(new Error('permitted customer')) },
        acl: {
          default: { add: vi.fn().mockRejectedValue(new Error('UBLA must be enabled')) },
          add: vi.fn().mockResolvedValue(undefined),
        },
      });
      const { ctx } = makeCtx();
      const out = await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: false });
      expect(out.warnings[0]).toContain('BOTH public access strategies blocked');
    });

    it('uses the generic "Could not make bucket publicly readable" warning for unknown ACL errors', async () => {
      const bucket = makeBucket({
        iam: { setPolicy: vi.fn().mockRejectedValue(new Error('permitted customer')) },
        acl: {
          default: { add: vi.fn().mockRejectedValue(new Error('connection reset')) },
          add: vi.fn().mockResolvedValue(undefined),
        },
      });
      const { ctx } = makeCtx();
      const out = await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: false });
      expect(out.warnings[0]).toContain('Could not make bucket publicly readable');
      expect(out.warnings[0]).toContain('Legacy ACL fallback also failed');
    });

    it('coerces non-Error throws from acl.default.add to strings', async () => {
      const bucket = makeBucket({
        iam: { setPolicy: vi.fn().mockRejectedValue(new Error('permitted customer')) },
        acl: {
          default: { add: vi.fn().mockRejectedValue('plain string error') },
          add: vi.fn().mockResolvedValue(undefined),
        },
      });
      const { ctx } = makeCtx();
      const out = await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: false });
      expect(out.failed).toBe(true);
      expect(out.error).toContain('plain string error');
    });
  });

  describe('IAM error coercion', () => {
    it('coerces non-Error throws from setPolicy to strings', async () => {
      const bucket = makeBucket({
        iam: { setPolicy: vi.fn().mockRejectedValue('synchronous string') },
      });
      const { ctx } = makeCtx();
      const out = await grantPublicAccess(bucket, 'b', false, ctx, { verifyAfterWrite: false });
      // Falls through to ACL fallback because not UBLA-forced and not org-policy → legacy-acl succeeds.
      expect(out.strategy).toBe('legacy-acl');
    });
  });
});
