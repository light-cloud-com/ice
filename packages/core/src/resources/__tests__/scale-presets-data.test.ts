/**
 * Smoke tests for the scale-presets-data orchestrator (rf-spdat split).
 *
 * Verifies that the per-category split (compute, database, storage,
 * networking, messaging, security, monitoring) re-assembles into the
 * expected `SCALE_PRESETS` dict shape — same keys, same key count, no
 * cross-category collisions.
 *
 * Per-tier values are pinned by the higher-level `scale-presets.test.ts`
 * smoke (sample postgres-db, frontend-app, backend-api lookups).
 */

import { describe, expect, it } from 'vitest';
import { SCALE_PRESETS } from '../scale-presets-data';
import { COMPUTE_PRESETS } from '../scale-presets-data/compute';
import { DATABASE_PRESETS } from '../scale-presets-data/database';
import { MESSAGING_PRESETS } from '../scale-presets-data/messaging';
import { MONITORING_PRESETS } from '../scale-presets-data/monitoring';
import { NETWORKING_PRESETS } from '../scale-presets-data/networking';
import { SECURITY_PRESETS } from '../scale-presets-data/security';
import { STORAGE_PRESETS } from '../scale-presets-data/storage';

const CATEGORY_BUNDLES = [
  { name: 'compute', record: COMPUTE_PRESETS, expectedCount: 12 },
  { name: 'database', record: DATABASE_PRESETS, expectedCount: 13 },
  { name: 'storage', record: STORAGE_PRESETS, expectedCount: 5 },
  { name: 'networking', record: NETWORKING_PRESETS, expectedCount: 3 },
  { name: 'messaging', record: MESSAGING_PRESETS, expectedCount: 6 },
  { name: 'security', record: SECURITY_PRESETS, expectedCount: 2 },
  { name: 'monitoring', record: MONITORING_PRESETS, expectedCount: 2 },
] as const;

describe('scale-presets-data — category bundles', () => {
  for (const { name, record, expectedCount } of CATEGORY_BUNDLES) {
    it(`${name} bundle has ${expectedCount} resource keys`, () => {
      expect(Object.keys(record)).toHaveLength(expectedCount);
    });
  }

  it('no key appears in two different category bundles', () => {
    const seen = new Map<string, string>();
    for (const { name, record } of CATEGORY_BUNDLES) {
      for (const k of Object.keys(record)) {
        const prior = seen.get(k);
        if (prior !== undefined) {
          throw new Error(`Resource key '${k}' appears in both '${prior}' and '${name}'`);
        }
        seen.set(k, name);
      }
    }
  });
});

describe('SCALE_PRESETS — provider coverage (C3 regression)', () => {
  // Resources that intentionally don't carry per-provider variants:
  // monitoring + security presets are universal settings (retention,
  // severity labels) that don't depend on the cloud provider.
  const PROVIDER_AGNOSTIC_KEYS = new Set<string>(['log-group', 'alert', 'secret-store', 'firewall']);

  it('every cloud-block scale tier with provider-specific values lists both AWS and Azure', () => {
    const missing: string[] = [];
    for (const [key, tiers] of Object.entries(SCALE_PRESETS)) {
      if (PROVIDER_AGNOSTIC_KEYS.has(key)) continue;
      for (const [tier, preset] of Object.entries(tiers ?? {})) {
        const providers = (preset as { _providers?: Record<string, unknown> })._providers;
        if (!providers) continue; // skip provider-agnostic tiers
        if (!providers.aws) missing.push(`${key}.${tier}: missing aws`);
        if (!providers.azure) missing.push(`${key}.${tier}: missing azure`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('SCALE_PRESETS — assembled dict', () => {
  it('contains exactly the union of every category bundle key', () => {
    const assembled = new Set(Object.keys(SCALE_PRESETS));
    const expected = new Set<string>();
    for (const { record } of CATEGORY_BUNDLES) {
      for (const k of Object.keys(record)) expected.add(k);
    }
    expect(assembled).toEqual(expected);
  });

  it('total resource key count equals the sum of category sizes', () => {
    const totalCategoryKeys = CATEGORY_BUNDLES.reduce((acc, { record }) => acc + Object.keys(record).length, 0);
    expect(Object.keys(SCALE_PRESETS)).toHaveLength(totalCategoryKeys);
  });

  it('preserves a sample of canonical keys spanning every category', () => {
    // One spot-check per category — guards against a wholesale assemble regression.
    expect(SCALE_PRESETS['frontend-app']).toBeDefined(); // compute
    expect(SCALE_PRESETS['postgres-db']).toBeDefined(); // database
    expect(SCALE_PRESETS['object-storage']).toBeDefined(); // storage
    expect(SCALE_PRESETS['load-balancer']).toBeDefined(); // networking
    expect(SCALE_PRESETS['message-queue']).toBeDefined(); // messaging
    expect(SCALE_PRESETS['secret-store']).toBeDefined(); // security
    expect(SCALE_PRESETS['log-group']).toBeDefined(); // monitoring
  });

  it('byte-identical preserves a known compute entry (frontend-app dev tier)', () => {
    expect(SCALE_PRESETS['frontend-app']?.dev).toEqual({
      fast_worldwide: false,
      _providers: {
        aws: { size: 'amplify-free' },
        gcp: { size: 'firebase-free' },
        azure: { size: 'azure-free' },
      },
    });
  });

  it('byte-identical preserves a known database entry (postgres-db medium tier)', () => {
    expect(SCALE_PRESETS['postgres-db']?.medium).toEqual({
      storage: '100',
      version: '17',
      production: true,
      backup_retention: '14',
      _providers: {
        aws: { size: 'db.r6g.large' },
        gcp: { size: 'db-custom-4-16384' },
        azure: { size: 'GP_Standard_D4s_v3' },
        digitalocean: { size: 'db-s-4vcpu-8gb' },
      },
    });
  });

  it('byte-identical preserves a known monitoring entry (alert very-high tier)', () => {
    expect(SCALE_PRESETS['alert']?.['very-high']).toEqual({
      severity: 'High — wake me up at 3am',
    });
  });
});
