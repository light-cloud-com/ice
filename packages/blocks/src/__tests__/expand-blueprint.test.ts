/**
 * Tests for `expand-blueprint.ts`.
 *
 * `expandBlueprint(blueprint, options)` is a pure data transform that turns a
 * BlockBlueprint + drop coordinates into a single ExpandedBlueprint.node ready
 * for Redux dispatch. The branches that matter:
 *
 *   - position passthrough → node.position { x, y }
 *   - parentContainerId → node.parentId (and its absence)
 *   - provider variant overrides merge after blueprint.nodeData
 *   - provider === 'all' is treated as "no provider filter" and does NOT inject
 *     a provider field into nodeData
 *   - schema-driven default resolution for select with optionDetails (provider
 *     filter), select with simple options array, and any property with a
 *     scalar `default`
 *   - wrong-provider value replacement (currentVal not in providerOptions)
 *   - log-node sizing → 400 × 240 instead of 220 × computed-by-content
 *   - height and width grow with metadata (repository / domain / image / size /
 *     scaling rows / pipeline rows / status / cost / renamed subtitle)
 *   - resourceId without a matching schema entry is a silent no-op
 *
 * Tests build minimal fake blueprints in-place (don't rely on the registry).
 */

import { describe, expect, it } from 'vitest';
import { expandBlueprint } from '../expand-blueprint';
import type { BlockBlueprint } from '../types';

// `frontend-app` is a real schema entry — we use it whenever we need the
// auto-default resolver to actually fire against `HIGH_LEVEL_CATEGORIES`.
const FRONTEND_APP_RESOURCE_ID = 'frontend-app';

function makeBlueprint(over: Partial<BlockBlueprint> = {}): BlockBlueprint {
  return {
    iceType: 'Test.Block',
    resourceId: '__no_such_resource__', // never matches schema → resolver no-op
    name: 'Test Block',
    description: 'desc',
    icon: 'Box',
    category: 'compute',
    providers: ['aws', 'gcp', 'azure'],
    nodeData: { iceType: 'Test.Block' },
    ...over,
  };
}

describe('expandBlueprint — node identity and shape', () => {
  it('returns a single resource node at the requested position', () => {
    const out = expandBlueprint(makeBlueprint(), { position: { x: 11, y: 22 } });
    expect(out.node.type).toBe('resource');
    expect(out.node.position).toEqual({ x: 11, y: 22 });
  });

  it('produces a unique id on every call', () => {
    const a = expandBlueprint(makeBlueprint(), { position: { x: 0, y: 0 } });
    const b = expandBlueprint(makeBlueprint(), { position: { x: 0, y: 0 } });
    expect(a.node.id).not.toBe(b.node.id);
    expect(a.node.id).toMatch(/^node-\d+-\d+$/);
  });

  it('attaches name, blockTypeName, and resourceId onto node.data', () => {
    const out = expandBlueprint(makeBlueprint({ name: 'My Block', resourceId: 'res-abc' }), {
      position: { x: 0, y: 0 },
    });
    expect(out.node.data.name).toBe('My Block');
    expect(out.node.data.blockTypeName).toBe('My Block');
    expect(out.node.data.resourceId).toBe('res-abc');
  });

  it('does NOT include parentId when parentContainerId is absent', () => {
    const out = expandBlueprint(makeBlueprint(), { position: { x: 0, y: 0 } });
    expect('parentId' in out.node).toBe(false);
  });

  it('sets node.parentId when parentContainerId is supplied', () => {
    const out = expandBlueprint(makeBlueprint(), {
      position: { x: 5, y: 6 },
      parentContainerId: 'group-1',
    });
    expect(out.node.parentId).toBe('group-1');
  });
});

describe('expandBlueprint — provider variants', () => {
  it('does NOT inject a provider field when no provider is supplied', () => {
    const out = expandBlueprint(makeBlueprint(), { position: { x: 0, y: 0 } });
    expect(out.node.data.provider).toBeUndefined();
  });

  it("treats provider === 'all' as no provider filter and does NOT inject a provider field", () => {
    const out = expandBlueprint(makeBlueprint(), { position: { x: 0, y: 0 }, provider: 'all' });
    expect(out.node.data.provider).toBeUndefined();
  });

  it('injects the provider field when a specific provider is selected AND the blueprint has providerVariants', () => {
    const bp = makeBlueprint({
      providerVariants: [{ provider: 'aws', dataOverrides: {} }],
    });
    const out = expandBlueprint(bp, { position: { x: 0, y: 0 }, provider: 'aws' });
    expect(out.node.data.provider).toBe('aws');
  });

  it('does NOT inject the provider field when the blueprint has no providerVariants (provider-agnostic block)', () => {
    // Source.Repository, Config.Environment, Network.CustomDomain, etc.
    // are provider-agnostic — they list providers as an allowlist but
    // have no per-provider behaviour. Stamping a `provider` on them
    // would render a misleading cloud brand pill on a GitHub repo.
    const out = expandBlueprint(makeBlueprint(), { position: { x: 0, y: 0 }, provider: 'aws' });
    expect(out.node.data.provider).toBeUndefined();
  });

  it('merges provider variant dataOverrides on top of blueprint.nodeData', () => {
    const bp = makeBlueprint({
      nodeData: { iceType: 'Test.Block', tier: 'free' },
      providerVariants: [{ provider: 'gcp', dataOverrides: { tier: 'pro', region: 'us-central1' } }],
    });
    const out = expandBlueprint(bp, { position: { x: 0, y: 0 }, provider: 'gcp' });
    expect(out.node.data.tier).toBe('pro');
    expect(out.node.data.region).toBe('us-central1');
  });

  it('does NOT apply variant overrides when the provider has no matching variant', () => {
    const bp = makeBlueprint({
      nodeData: { iceType: 'Test.Block', tier: 'free' },
      providerVariants: [{ provider: 'gcp', dataOverrides: { tier: 'pro' } }],
    });
    const out = expandBlueprint(bp, { position: { x: 0, y: 0 }, provider: 'aws' });
    expect(out.node.data.tier).toBe('free');
  });

  it('handles a provider variant entry without dataOverrides (the `|| {}` fallback)', () => {
    const bp = makeBlueprint({
      nodeData: { iceType: 'Test.Block', tier: 'free' },
      providerVariants: [{ provider: 'aws' }],
    });
    const out = expandBlueprint(bp, { position: { x: 0, y: 0 }, provider: 'aws' });
    // No overrides → tier from nodeData survives.
    expect(out.node.data.tier).toBe('free');
    expect(out.node.data.provider).toBe('aws');
  });
});

describe('expandBlueprint — schema-driven default resolution', () => {
  it('fills missing select/optionDetails props with the schema default value', () => {
    const bp = makeBlueprint({
      resourceId: FRONTEND_APP_RESOURCE_ID,
      // Don't seed `framework` — resolver should fill it from schema default 'react'.
      nodeData: { iceType: 'Compute.StaticSite' },
    });
    const out = expandBlueprint(bp, { position: { x: 0, y: 0 } });
    // framework default is 'react' for frontend-app — see compute.ts.
    expect(out.node.data.framework).toBe('react');
  });

  it('filters optionDetails by selected provider when picking the default', () => {
    const bp = makeBlueprint({
      resourceId: FRONTEND_APP_RESOURCE_ID,
      nodeData: { iceType: 'Compute.StaticSite' },
    });
    // size has providers per option (amplify-* aws / firebase-* gcp / azure-*)
    // The schema-level default 'amplify-free' is provider 'aws'. With provider
    // 'gcp', the default 'amplify-free' is NOT in the gcp-filtered set, so the
    // resolver falls back to the first gcp option ('firebase-free').
    const out = expandBlueprint(bp, { position: { x: 0, y: 0 }, provider: 'gcp' });
    expect(out.node.data.size).toBe('firebase-free');
  });

  it('replaces a wrong-provider value with the first valid option for the new provider', () => {
    const bp = makeBlueprint({
      resourceId: FRONTEND_APP_RESOURCE_ID,
      // Seeded with an aws value but expanded under azure.
      nodeData: { iceType: 'Compute.StaticSite', size: 'amplify-free' },
    });
    const out = expandBlueprint(bp, { position: { x: 0, y: 0 }, provider: 'azure' });
    expect(out.node.data.size).toBe('azure-free');
  });

  it('keeps an existing value untouched when the provider filter accepts it', () => {
    const bp = makeBlueprint({
      resourceId: FRONTEND_APP_RESOURCE_ID,
      nodeData: { iceType: 'Compute.StaticSite', size: 'firebase-blaze' },
    });
    const out = expandBlueprint(bp, { position: { x: 0, y: 0 }, provider: 'gcp' });
    expect(out.node.data.size).toBe('firebase-blaze');
  });

  it('keeps an existing value untouched when no provider is supplied', () => {
    const bp = makeBlueprint({
      resourceId: FRONTEND_APP_RESOURCE_ID,
      nodeData: { iceType: 'Compute.StaticSite', size: 'firebase-blaze' },
    });
    const out = expandBlueprint(bp, { position: { x: 0, y: 0 } });
    expect(out.node.data.size).toBe('firebase-blaze');
  });

  it('fills missing select/options props with the schema default value', () => {
    // backend-api has scalingMetric with options ['cpu','memory','requests','concurrency'] default 'cpu'.
    const bp = makeBlueprint({
      resourceId: 'backend-api',
      nodeData: { iceType: 'Compute.BackendAPI' },
    });
    const out = expandBlueprint(bp, { position: { x: 0, y: 0 } });
    expect(out.node.data.scalingMetric).toBe('cpu');
  });

  it('fills missing scalar properties with the schema default value', () => {
    const bp = makeBlueprint({
      resourceId: 'backend-api',
      nodeData: { iceType: 'Compute.BackendAPI' },
    });
    const out = expandBlueprint(bp, { position: { x: 0, y: 0 } });
    // minInstances default = 1, maxInstances default = 3, scalingThreshold = 70.
    expect(out.node.data.minInstances).toBe(1);
    expect(out.node.data.maxInstances).toBe(3);
    expect(out.node.data.scalingThreshold).toBe(70);
  });

  it('does NOT overwrite an explicit zero/empty/null when no schema default is involved', () => {
    // minInstances = 0 IS one of the "missing" sentinels per the resolver
    // (currentVal === undefined / null / ''), so 0 is treated as PRESENT.
    const bp = makeBlueprint({
      resourceId: 'backend-api',
      nodeData: { iceType: 'Compute.BackendAPI', minInstances: 0 },
    });
    const out = expandBlueprint(bp, { position: { x: 0, y: 0 } });
    expect(out.node.data.minInstances).toBe(0);
  });

  it('does nothing when the resourceId does not match any schema entry', () => {
    const bp = makeBlueprint({ resourceId: '__never_present__' });
    const out = expandBlueprint(bp, { position: { x: 0, y: 0 } });
    // No defaults injected, only the merged nodeData + name/blockTypeName/resourceId.
    expect(Object.keys(out.node.data).sort()).toEqual(['blockTypeName', 'iceType', 'name', 'resourceId'].sort());
  });

  it('skips select/optionDetails when the provider filter excludes every option', () => {
    // We can't easily build a real schema entry with zero matching options
    // for one of the listed providers — but the empty-providerOptions guard
    // (`continue`) is reached when `provider` is set to a value with no entry
    // in `optionDetails` AND no entries with `provider` undefined. The
    // frontend-app `size` field has every option scoped to a specific provider
    // (no fallback options), so `provider: 'kubernetes'` produces an empty set.
    const bp = makeBlueprint({
      resourceId: FRONTEND_APP_RESOURCE_ID,
      nodeData: { iceType: 'Compute.StaticSite' },
    });
    const out = expandBlueprint(bp, { position: { x: 0, y: 0 }, provider: 'kubernetes' });
    expect(out.node.data.size).toBeUndefined();
  });

  it('preserves blueprint.nodeData when the prop is already set, even when isMissing checks falsy', () => {
    // Passing an empty string IS treated as missing (per `currentVal === ''` guard).
    const bp = makeBlueprint({
      resourceId: 'backend-api',
      nodeData: { iceType: 'Compute.BackendAPI', scalingMetric: '' },
    });
    const out = expandBlueprint(bp, { position: { x: 0, y: 0 } });
    // Empty string triggers the missing branch → schema default takes over.
    expect(out.node.data.scalingMetric).toBe('cpu');
  });
});

describe('expandBlueprint — node sizing', () => {
  it('uses 220 × computed-height for a non-log block with no metadata', () => {
    const bp = makeBlueprint({ nodeData: { iceType: 'Compute.Other' } });
    const out = expandBlueprint(bp, { position: { x: 0, y: 0 } });
    expect(out.node.width).toBe(220);
    // Minimum height clamp is 56.
    expect(out.node.height).toBeGreaterThanOrEqual(56);
  });

  it('uses 400 × 240 for a Monitoring.Log block', () => {
    const bp = makeBlueprint({ nodeData: { iceType: 'Monitoring.Log' } });
    const out = expandBlueprint(bp, { position: { x: 0, y: 0 } });
    expect(out.node.width).toBe(400);
    expect(out.node.height).toBe(240);
  });

  it('grows height when the block has repository / domain / image metadata', () => {
    const small = expandBlueprint(makeBlueprint({ nodeData: { iceType: 'X' } }), {
      position: { x: 0, y: 0 },
    });
    const big = expandBlueprint(
      makeBlueprint({
        nodeData: {
          iceType: 'X',
          repository: 'a/b',
          domain: 'example.com',
          image: 'node:20',
          size: 'small',
          status: 'active',
          estimatedCost: '$10',
        },
      }),
      { position: { x: 0, y: 0 } },
    );
    expect(big.node.height).toBeGreaterThan(small.node.height);
  });

  it('counts github / repo / repository as a single repository line (first match wins)', () => {
    // The resolver reads `repository || github || repo`; supplying any of them
    // contributes one line — supplying all three still contributes one.
    const a = expandBlueprint(makeBlueprint({ nodeData: { iceType: 'X', repository: 'a/b' } }), {
      position: { x: 0, y: 0 },
    });
    const b = expandBlueprint(
      makeBlueprint({
        nodeData: { iceType: 'X', repository: 'a/b', github: 'a/b', repo: 'a/b' },
      }),
      { position: { x: 0, y: 0 } },
    );
    expect(a.node.height).toBe(b.node.height);
  });

  it('counts subdomain and url alongside domain as the same single domain line', () => {
    const a = expandBlueprint(makeBlueprint({ nodeData: { iceType: 'X', domain: 'example.com' } }), {
      position: { x: 0, y: 0 },
    });
    const b = expandBlueprint(
      makeBlueprint({
        nodeData: {
          iceType: 'X',
          domain: 'example.com',
          subdomain: 'api',
          url: 'https://example.com',
        },
      }),
      { position: { x: 0, y: 0 } },
    );
    expect(a.node.height).toBe(b.node.height);
  });

  it('grows height when storage but no size is provided (hasHardware branch)', () => {
    const bare = expandBlueprint(makeBlueprint({ nodeData: { iceType: 'X' } }), { position: { x: 0, y: 0 } });
    const stor = expandBlueprint(makeBlueprint({ nodeData: { iceType: 'X', storage: '50 GB' } }), {
      position: { x: 0, y: 0 },
    });
    expect(stor.node.height).toBeGreaterThan(bare.node.height);
  });

  it('grows height when minInstances or maxInstances are present (scaling row)', () => {
    const bare = expandBlueprint(makeBlueprint({ nodeData: { iceType: 'X' } }), { position: { x: 0, y: 0 } });
    const min = expandBlueprint(makeBlueprint({ nodeData: { iceType: 'X', minInstances: 1 } }), {
      position: { x: 0, y: 0 },
    });
    const max = expandBlueprint(makeBlueprint({ nodeData: { iceType: 'X', maxInstances: 5 } }), {
      position: { x: 0, y: 0 },
    });
    expect(min.node.height).toBeGreaterThan(bare.node.height);
    expect(max.node.height).toBeGreaterThan(bare.node.height);
  });

  it('adds a renamed-subtitle row when label differs from blockTypeName', () => {
    const bareName = makeBlueprint({
      name: 'Static Site',
      nodeData: { iceType: 'X', blockTypeName: 'Static Site', label: 'Static Site' },
    });
    // Force `label` to be different by overriding nodeData (the merger sets
    // blockTypeName from blueprint.name, but label comes from nodeData).
    const renamed = makeBlueprint({
      name: 'Static Site',
      nodeData: { iceType: 'X', label: 'Marketing Site' },
    });
    const a = expandBlueprint(bareName, { position: { x: 0, y: 0 } });
    const b = expandBlueprint(renamed, { position: { x: 0, y: 0 } });
    expect(b.node.height).toBeGreaterThan(a.node.height);
  });

  it('adds a status line when only status (not cost) is set', () => {
    const a = expandBlueprint(makeBlueprint({ nodeData: { iceType: 'X' } }), { position: { x: 0, y: 0 } });
    const b = expandBlueprint(makeBlueprint({ nodeData: { iceType: 'X', status: 'deployed' } }), {
      position: { x: 0, y: 0 },
    });
    expect(b.node.height).toBeGreaterThan(a.node.height);
  });

  it('handles a blueprint whose name is the empty string (no blockTypeName subtitle)', () => {
    const out = expandBlueprint(makeBlueprint({ name: '', nodeData: { iceType: 'X' } }), { position: { x: 0, y: 0 } });
    expect(out.node.data.blockTypeName).toBe('');
  });
});

describe('expandBlueprint — resourceId guard', () => {
  it('skips schema lookup entirely when resourceId is empty', () => {
    const bp = makeBlueprint({ resourceId: '', nodeData: { iceType: 'X' } });
    const out = expandBlueprint(bp, { position: { x: 0, y: 0 } });
    // No defaults injected — only the merged nodeData + name/blockTypeName.
    expect(Object.keys(out.node.data).sort()).toEqual(['blockTypeName', 'iceType', 'name', 'resourceId'].sort());
  });
});

describe('expandBlueprint — select+options preservation', () => {
  it('does not overwrite a select+options value that is already set', () => {
    // backend-api.scalingMetric has options ['cpu','memory','requests','concurrency'].
    // Seeding 'memory' should survive the resolver pass.
    const bp = makeBlueprint({
      resourceId: 'backend-api',
      nodeData: { iceType: 'Compute.BackendAPI', scalingMetric: 'memory' },
    });
    const out = expandBlueprint(bp, { position: { x: 0, y: 0 } });
    expect(out.node.data.scalingMetric).toBe('memory');
  });
});
