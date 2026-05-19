/**
 * `utils/security-rules.ts` invariant tests.
 *
 * `analyzeSecurityWarnings(nodes, edges)` runs six deterministic rules
 * over a canvas snapshot:
 *
 *   1. Public database (no VPC, no private_ip) — critical
 *   2. Service with env_vars but no Secret Manager edge — warning
 *   3. Public storage (public flag or `access: 'allUsers'`) — warning
 *   4. Gateway with no Auth edge — warning
 *   5. No monitoring blocks at all — info
 *   6. ≥2 services without a Network.VPC / Network.PrivateNetwork — info
 *
 * Branch coverage is the load-bearing target. Each rule has truthy/falsy
 * branches plus the secondary classifier predicates (isVpcLike, isInsideVpc
 * walk depth limit, edge-other-end resolution where edge.source ===
 * nodeId vs edge.target === nodeId, etc.) that need explicit drives.
 */

import { describe, it, expect } from 'vitest';
import { analyzeSecurityWarnings, type PreDeployWarning } from '../security-rules';
import type { CardNode, CardEdge } from '../../../../store/slices/cards-slice';

// ─── Test fixtures ──────────────────────────────────────────────────────────

let _id = 0;
function n(iceType: string, data: Record<string, unknown> = {}, parentId?: string): CardNode {
  const id = `node-${++_id}`;
  return {
    id,
    type: 'block',
    position: { x: 0, y: 0 },
    width: 100,
    height: 100,
    parentId,
    data: { iceType, ...data },
  };
}

function withId(id: string, iceType: string, data: Record<string, unknown> = {}, parentId?: string): CardNode {
  return {
    id,
    type: 'block',
    position: { x: 0, y: 0 },
    width: 100,
    height: 100,
    parentId,
    data: { iceType, ...data },
  };
}

function e(source: string, target: string): CardEdge {
  return { id: `edge-${source}-${target}`, source, target };
}

// ─── Empty / no-ops ─────────────────────────────────────────────────────────

describe('analyzeSecurityWarnings (empty inputs)', () => {
  it('returns an empty array for empty nodes and empty edges', () => {
    expect(analyzeSecurityWarnings([], [])).toEqual([]);
  });

  it('returns an empty array for irrelevant nodes (no rules trigger)', () => {
    const nodes = [n('Compute.Function'), n('Monitoring.Log')];
    expect(analyzeSecurityWarnings(nodes, [])).toEqual([]);
  });
});

// ─── Rule 1: Public database ────────────────────────────────────────────────

describe('Rule 1: public database', () => {
  it('flags a Database.* node not inside a VPC and without private_ip', () => {
    const db = n('Database.Postgres', { label: 'orders-db' });
    const w = analyzeSecurityWarnings([db], []);
    const found = w.find((x) => x.id === `sec-public-db-${db.id}`);
    expect(found).toMatchObject({
      severity: 'critical',
      category: 'security',
      title: 'Database is publicly reachable',
      nodeId: db.id,
      dismissible: false,
    });
    expect(found?.description).toContain('orders-db');
  });

  it('uses the node id as the description fallback when no label is set', () => {
    const db = withId('db-no-label', 'Database.Postgres');
    const w = analyzeSecurityWarnings([db], []);
    expect(w[0]?.description).toContain('db-no-label');
  });

  it('does NOT flag a database with private_ip === true', () => {
    const db = n('Database.Postgres', { private_ip: true });
    expect(analyzeSecurityWarnings([db], [])).toEqual([]);
  });

  it('does NOT flag a database with privateIp (camelCase) === true', () => {
    const db = n('Database.MySQL', { privateIp: true });
    expect(analyzeSecurityWarnings([db], [])).toEqual([]);
  });

  it('does NOT flag a database directly inside a Network.VPC parent', () => {
    const vpc = n('Network.VPC');
    const db = n('Database.Postgres', {}, vpc.id);
    expect(analyzeSecurityWarnings([vpc, db], [])).toEqual([]);
  });

  it('does NOT flag a database directly inside a Network.PrivateNetwork', () => {
    const pn = n('Network.PrivateNetwork');
    const db = n('Database.Postgres', {}, pn.id);
    expect(analyzeSecurityWarnings([pn, db], [])).toEqual([]);
  });

  it('does NOT flag a database directly inside a Network.Subnet', () => {
    const sn = n('Network.Subnet');
    const db = n('Database.Postgres', {}, sn.id);
    expect(analyzeSecurityWarnings([sn, db], [])).toEqual([]);
  });

  it('walks parent chain transitively (Subnet inside VPC counts)', () => {
    const vpc = n('Network.VPC');
    const sn = n('Network.Subnet', {}, vpc.id);
    const db = n('Database.Postgres', {}, sn.id);
    // The subnet is itself VpcLike so we don't need to keep walking; pin
    // the walk anyway via a non-VPC intermediate parent below.
    expect(analyzeSecurityWarnings([vpc, sn, db], [])).toEqual([]);
  });

  it('walks past a non-VPC parent and finds VPC at the grandparent', () => {
    const vpc = n('Network.VPC');
    // A "container" parent that is not VpcLike but lives inside a VPC.
    // Use a non-service, non-classifier ice type for the intermediate so
    // unrelated rules (5, 6) do not fire and obscure the assertion.
    const group = n('Container.Group', {}, vpc.id);
    const db = n('Database.Postgres', {}, group.id);
    const w = analyzeSecurityWarnings([vpc, group, db], []);
    expect(w.find((x) => x.id.startsWith('sec-public-db-'))).toBeUndefined();
  });

  it('flags a database whose parent chain points to a missing parent (treated as not in VPC)', () => {
    const db = withId('orphan-db', 'Database.Postgres', {}, 'no-such-parent');
    const w = analyzeSecurityWarnings([db], []);
    expect(w[0]?.id).toBe('sec-public-db-orphan-db');
  });

  it('terminates the parent walk at depth 10 (cycle / very deep tree)', () => {
    // Build a 12-deep linear chain ending in a Database with no VPC.
    // The walker bails out after 10 hops, so the database is treated as
    // not in a VPC and gets flagged.
    const chain: CardNode[] = [];
    let parentId: string | undefined;
    for (let i = 0; i < 12; i++) {
      const c = withId(`chain-${i}`, 'Compute.Function', {}, parentId);
      chain.push(c);
      parentId = c.id;
    }
    const db = withId('deep-db', 'Database.Postgres', {}, parentId);
    const w = analyzeSecurityWarnings([...chain, db], []);
    expect(w.find((x) => x.id === 'sec-public-db-deep-db')).toBeDefined();
  });

  it('handles nodes with no iceType at all (treated as non-classified)', () => {
    const node: CardNode = {
      id: 'no-type',
      type: 'block',
      position: { x: 0, y: 0 },
      width: 100,
      height: 100,
      data: {},
    };
    expect(analyzeSecurityWarnings([node], [])).toEqual([]);
  });
});

// ─── Rule 2: Missing secrets ────────────────────────────────────────────────

describe('Rule 2: missing secrets', () => {
  it('flags a Compute.* with non-empty env_vars and no Secret Manager edge', () => {
    const svc = n('Compute.Function', { label: 'api', env_vars: ['DB_URL'] });
    const w = analyzeSecurityWarnings([svc], []);
    const found = w.find((x) => x.id === `sec-missing-secrets-${svc.id}`);
    expect(found).toMatchObject({
      severity: 'warning',
      category: 'security',
      title: 'Service has env vars but no Secret Manager',
      nodeId: svc.id,
      dismissible: true,
    });
    expect(found?.description).toContain('api');
  });

  it('uses node id as fallback when no label is set', () => {
    const svc = withId('svc-no-label', 'Compute.Function', { env_vars: ['X'] });
    const w = analyzeSecurityWarnings([svc], []);
    expect(w[0]?.description).toContain('svc-no-label');
  });

  it('does NOT flag a service with empty env_vars array', () => {
    const svc = n('Compute.Function', { env_vars: [] });
    const w = analyzeSecurityWarnings([svc], []);
    expect(w.find((x) => x.id.startsWith('sec-missing-secrets-'))).toBeUndefined();
  });

  it('does NOT flag a service with no env_vars field at all', () => {
    const svc = n('Compute.Function');
    const w = analyzeSecurityWarnings([svc], []);
    expect(w.find((x) => x.id.startsWith('sec-missing-secrets-'))).toBeUndefined();
  });

  it('does NOT flag a service with non-array env_vars', () => {
    const svc = n('Compute.Function', { env_vars: 'not-an-array' });
    const w = analyzeSecurityWarnings([svc], []);
    expect(w.find((x) => x.id.startsWith('sec-missing-secrets-'))).toBeUndefined();
  });

  it('does NOT flag when a Secret Manager block exists AND is connected (svc → secret)', () => {
    const svc = n('Compute.Function', { env_vars: ['X'] });
    const secret = n('Security.Secret');
    const edge = e(svc.id, secret.id);
    expect(
      analyzeSecurityWarnings([svc, secret], [edge]).find((x) => x.id.startsWith('sec-missing-secrets-')),
    ).toBeUndefined();
  });

  it('does NOT flag when the edge runs in the reverse direction (secret → svc)', () => {
    const svc = n('Compute.Function', { env_vars: ['X'] });
    const secret = n('Security.Secret');
    const edge = e(secret.id, svc.id);
    expect(
      analyzeSecurityWarnings([svc, secret], [edge]).find((x) => x.id.startsWith('sec-missing-secrets-')),
    ).toBeUndefined();
  });

  it('flags when a Secret block exists but is connected to a different service', () => {
    const svc1 = n('Compute.Function', { env_vars: ['X'] });
    const svc2 = n('Compute.Function', { env_vars: ['Y'] });
    const secret = n('Security.Secret');
    const edge = e(svc2.id, secret.id);
    const w = analyzeSecurityWarnings([svc1, svc2, secret], [edge]);
    expect(w.find((x) => x.id === `sec-missing-secrets-${svc1.id}`)).toBeDefined();
    expect(w.find((x) => x.id === `sec-missing-secrets-${svc2.id}`)).toBeUndefined();
  });

  it('flags every service when there are zero secret nodes on the canvas', () => {
    const a = n('Compute.Function', { env_vars: ['X'] });
    const b = n('Compute.Function', { env_vars: ['Y'] });
    const w = analyzeSecurityWarnings([a, b], []);
    expect(w.find((x) => x.id === `sec-missing-secrets-${a.id}`)).toBeDefined();
    expect(w.find((x) => x.id === `sec-missing-secrets-${b.id}`)).toBeDefined();
  });

  it('handles edges where source/target is unrelated to the service (other-end lookup returns null)', () => {
    const svc = n('Compute.Function', { env_vars: ['X'] });
    const secret = n('Security.Secret');
    const other1 = n('Compute.Function');
    const other2 = n('Compute.Function');
    // Edge that doesn't touch svc.id at all — the predicate returns false
    // via the third branch of the ternary (`: null`).
    const unrelated = e(other1.id, other2.id);
    const w = analyzeSecurityWarnings([svc, secret, other1, other2], [unrelated]);
    expect(w.find((x) => x.id === `sec-missing-secrets-${svc.id}`)).toBeDefined();
  });
});

// ─── Rule 3: Public storage ─────────────────────────────────────────────────

describe('Rule 3: public storage', () => {
  it('flags a Storage.Bucket with public === true', () => {
    const b = n('Storage.Bucket', { label: 'public-files', public: true });
    const w = analyzeSecurityWarnings([b], []);
    const found = w.find((x) => x.id === `sec-public-storage-${b.id}`);
    expect(found).toMatchObject({
      severity: 'warning',
      category: 'security',
      title: 'Storage bucket is publicly accessible',
      nodeId: b.id,
      dismissible: true,
    });
    expect(found?.description).toContain('public-files');
  });

  it('flags a Storage.Bucket with access === "allUsers"', () => {
    const b = n('Storage.Bucket', { access: 'allUsers' });
    const w = analyzeSecurityWarnings([b], []);
    expect(w.find((x) => x.id === `sec-public-storage-${b.id}`)).toBeDefined();
  });

  it('uses node id when label is missing', () => {
    const b = withId('bucket-noid', 'Storage.Bucket', { public: true });
    const w = analyzeSecurityWarnings([b], []);
    expect(w[0]?.description).toContain('bucket-noid');
  });

  it('does NOT flag a private (default) Storage.Bucket', () => {
    const b = n('Storage.Bucket');
    expect(analyzeSecurityWarnings([b], [])).toEqual([]);
  });

  it('does NOT flag when public is the literal string "true" (only `=== true` matches)', () => {
    const b = n('Storage.Bucket', { public: 'true' });
    expect(analyzeSecurityWarnings([b], [])).toEqual([]);
  });

  it('does NOT flag when access is something other than "allUsers"', () => {
    const b = n('Storage.Bucket', { access: 'authenticated' });
    expect(analyzeSecurityWarnings([b], [])).toEqual([]);
  });
});

// ─── Rule 4: Gateway without auth ───────────────────────────────────────────

describe('Rule 4: gateway without auth', () => {
  it('flags a Network.Gateway with no Security.Identity on the canvas at all', () => {
    const gw = n('Network.Gateway', { label: 'main-gw' });
    const w = analyzeSecurityWarnings([gw], []);
    const found = w.find((x) => x.id === `sec-gateway-no-auth-${gw.id}`);
    expect(found).toMatchObject({
      severity: 'warning',
      category: 'security',
      title: 'API Gateway has no auth block',
      nodeId: gw.id,
      dismissible: true,
    });
    expect(found?.description).toContain('main-gw');
  });

  it('uses node id when label is missing', () => {
    const gw = withId('gw-no-label', 'Network.Gateway');
    const w = analyzeSecurityWarnings([gw], []);
    expect(w[0]?.description).toContain('gw-no-label');
  });

  it('flags a Gateway when Security.Identity exists but is not connected to it', () => {
    const gw = n('Network.Gateway');
    const auth = n('Security.Identity');
    expect(analyzeSecurityWarnings([gw, auth], []).find((x) => x.id.startsWith('sec-gateway-no-auth-'))).toBeDefined();
  });

  it('does NOT flag when Gateway is connected to Security.Identity (gw → auth)', () => {
    const gw = n('Network.Gateway');
    const auth = n('Security.Identity');
    expect(
      analyzeSecurityWarnings([gw, auth], [e(gw.id, auth.id)]).find((x) => x.id.startsWith('sec-gateway-no-auth-')),
    ).toBeUndefined();
  });

  it('does NOT flag when reverse edge (auth → gw)', () => {
    const gw = n('Network.Gateway');
    const auth = n('Security.Identity');
    expect(
      analyzeSecurityWarnings([gw, auth], [e(auth.id, gw.id)]).find((x) => x.id.startsWith('sec-gateway-no-auth-')),
    ).toBeUndefined();
  });
});

// ─── Rule 5: Missing monitoring ─────────────────────────────────────────────

describe('Rule 5: missing monitoring', () => {
  it('emits the bp-missing-monitoring info when there is at least one service and no monitoring', () => {
    const svc = n('Compute.Function');
    const w = analyzeSecurityWarnings([svc], []);
    const m = w.find((x) => x.id === 'bp-missing-monitoring');
    expect(m).toMatchObject({
      severity: 'info',
      category: 'best-practice',
      title: 'No monitoring blocks on canvas',
      dismissible: true,
    });
  });

  it('does NOT emit when at least one Monitoring.* node is present', () => {
    const svc = n('Compute.Function');
    const log = n('Monitoring.Log');
    expect(analyzeSecurityWarnings([svc, log], []).find((x) => x.id === 'bp-missing-monitoring')).toBeUndefined();
  });

  it('does NOT emit when there are no services on the canvas', () => {
    const db = n('Database.Postgres', { private_ip: true });
    expect(analyzeSecurityWarnings([db], []).find((x) => x.id === 'bp-missing-monitoring')).toBeUndefined();
  });

  it('counts other Monitoring.* subtypes as monitoring', () => {
    const svc = n('Compute.Function');
    const log = n('Monitoring.Dashboard');
    expect(analyzeSecurityWarnings([svc, log], []).find((x) => x.id === 'bp-missing-monitoring')).toBeUndefined();
  });
});

// ─── Rule 6: No private network ─────────────────────────────────────────────

describe('Rule 6: no private network with multiple services', () => {
  it('emits bp-no-vpc when there are 2+ services and no VPC/PrivateNetwork', () => {
    const a = n('Compute.Function');
    const b = n('Compute.Function');
    const log = n('Monitoring.Log');
    const w = analyzeSecurityWarnings([a, b, log], []);
    const m = w.find((x) => x.id === 'bp-no-vpc');
    expect(m).toMatchObject({
      severity: 'info',
      category: 'best-practice',
      title: 'Multiple services without a private network',
      dismissible: true,
    });
  });

  it('does NOT emit bp-no-vpc with only 1 service', () => {
    const a = n('Compute.Function');
    const log = n('Monitoring.Log');
    expect(analyzeSecurityWarnings([a, log], []).find((x) => x.id === 'bp-no-vpc')).toBeUndefined();
  });

  it('does NOT emit bp-no-vpc when a Network.VPC node is present', () => {
    const vpc = n('Network.VPC');
    const a = n('Compute.Function', {}, vpc.id);
    const b = n('Compute.Function', {}, vpc.id);
    const log = n('Monitoring.Log');
    expect(analyzeSecurityWarnings([vpc, a, b, log], []).find((x) => x.id === 'bp-no-vpc')).toBeUndefined();
  });

  it('does NOT emit bp-no-vpc when a Network.PrivateNetwork is present', () => {
    const pn = n('Network.PrivateNetwork');
    const a = n('Compute.Function');
    const b = n('Compute.Function');
    const log = n('Monitoring.Log');
    expect(analyzeSecurityWarnings([pn, a, b, log], []).find((x) => x.id === 'bp-no-vpc')).toBeUndefined();
  });

  it('STILL emits bp-no-vpc when only a Network.Subnet exists (Subnet alone is not a boundary)', () => {
    // The boundary check only counts isVpc OR isPrivateNetwork — Subnet
    // is excluded. This verifies the explicit OR (NOT isVpcLike).
    const sn = n('Network.Subnet');
    const a = n('Compute.Function');
    const b = n('Compute.Function');
    const log = n('Monitoring.Log');
    expect(analyzeSecurityWarnings([sn, a, b, log], []).find((x) => x.id === 'bp-no-vpc')).toBeDefined();
  });
});

// ─── Rule co-occurrence ─────────────────────────────────────────────────────

describe('analyzeSecurityWarnings — multiple rules firing simultaneously', () => {
  it('returns warnings from all rules without deduplication', () => {
    const db = n('Database.Postgres', { label: 'db' }); // Rule 1
    const svc1 = n('Compute.Function', { label: 'svc-1', env_vars: ['X'] }); // Rule 2 + Rule 6
    const svc2 = n('Compute.Function', { label: 'svc-2', env_vars: ['Y'] }); // Rule 2 + Rule 6
    const bucket = n('Storage.Bucket', { label: 'bk', public: true }); // Rule 3
    const gw = n('Network.Gateway', { label: 'gw' }); // Rule 4
    // No monitoring → Rule 5
    const w: PreDeployWarning[] = analyzeSecurityWarnings([db, svc1, svc2, bucket, gw], []);

    const ids = w.map((x) => x.id).sort();
    expect(ids).toContain(`sec-public-db-${db.id}`);
    expect(ids).toContain(`sec-missing-secrets-${svc1.id}`);
    expect(ids).toContain(`sec-missing-secrets-${svc2.id}`);
    expect(ids).toContain(`sec-public-storage-${bucket.id}`);
    expect(ids).toContain(`sec-gateway-no-auth-${gw.id}`);
    expect(ids).toContain('bp-missing-monitoring');
    expect(ids).toContain('bp-no-vpc');
  });

  it('preserves rule ordering: Rule 1 → 2 → 3 → 4 → 5 → 6', () => {
    const db = n('Database.Postgres');
    const svc = n('Compute.Function', { env_vars: ['X'] });
    const svc2 = n('Compute.Function', { env_vars: ['Y'] });
    const bucket = n('Storage.Bucket', { public: true });
    const gw = n('Network.Gateway');
    const w = analyzeSecurityWarnings([db, svc, svc2, bucket, gw], []);
    const orderedIds = w.map((x) => x.id);
    // Find the FIRST occurrence of each rule's id pattern.
    const idx = (pattern: string) => orderedIds.findIndex((id) => id.includes(pattern));
    expect(idx('sec-public-db-')).toBeLessThan(idx('sec-missing-secrets-'));
    expect(idx('sec-missing-secrets-')).toBeLessThan(idx('sec-public-storage-'));
    expect(idx('sec-public-storage-')).toBeLessThan(idx('sec-gateway-no-auth-'));
    expect(idx('sec-gateway-no-auth-')).toBeLessThan(orderedIds.indexOf('bp-missing-monitoring'));
    expect(orderedIds.indexOf('bp-missing-monitoring')).toBeLessThan(orderedIds.indexOf('bp-no-vpc'));
  });
});
