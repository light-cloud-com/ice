/**
 * Unit tests for `services/deploy/src/utils/find-source-node-id.ts` —
 * the pure resource-name maps + 4-tier source-node lookup extracted in
 * rf-deploy-3 from the deploy.service.ts orchestrator.
 *
 * Per the `deploy-service-tests-must-import-vitest-explicitly` learning,
 * vitest globals are imported explicitly so the deploy package's
 * typecheck pass stays green.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildResourceNameMaps,
  makeFindSourceNodeId,
  type DeployableForResourceMaps,
  type PersistedMappingEntry,
} from '../find-source-node-id.js';

describe('buildResourceNameMaps', () => {
  it('returns empty maps when given an empty deployables array and empty persisted map', () => {
    const result = buildResourceNameMaps([], new Map());
    expect(result.nameToNodeId.size).toBe(0);
    expect(result.graphIdToCanvasId.size).toBe(0);
    expect(result.persistedNameToNodeId.size).toBe(0);
    expect(result.persistedProviderIdToNodeId.size).toBe(0);
  });

  it('builds nameToNodeId from each deployable', () => {
    const deployables: DeployableForResourceMaps[] = [
      { resource_type: 'storage_bucket', resource_name: 'bucket-1', node_id: 'canvas-a' },
      { resource_type: 'cloud_run', resource_name: 'service-1', node_id: 'canvas-b' },
    ];
    const result = buildResourceNameMaps(deployables, new Map());
    expect(result.nameToNodeId.get('bucket-1')).toBe('canvas-a');
    expect(result.nameToNodeId.get('service-1')).toBe('canvas-b');
    expect(result.nameToNodeId.size).toBe(2);
  });

  it('keys graphIdToCanvasId by `${resource_type}:${resource_name}`', () => {
    const deployables: DeployableForResourceMaps[] = [
      { resource_type: 'storage_bucket', resource_name: 'bucket-1', node_id: 'canvas-a' },
      { resource_type: 'cloud_run', resource_name: 'service-1', node_id: 'canvas-b' },
    ];
    const result = buildResourceNameMaps(deployables, new Map());
    expect(result.graphIdToCanvasId.get('storage_bucket:bucket-1')).toBe('canvas-a');
    expect(result.graphIdToCanvasId.get('cloud_run:service-1')).toBe('canvas-b');
    // The graph-id key uses the colon separator, not the bare name
    expect(result.graphIdToCanvasId.has('bucket-1')).toBe(false);
  });

  it('builds persistedNameToNodeId only for entries that have a name', () => {
    const persisted = new Map<string, PersistedMappingEntry>([
      ['canvas-a', { name: 'bucket-1' }],
      ['canvas-b', { providerId: 'projects/x/services/y' }], // no name
      ['canvas-c', { name: 'service-1', providerId: 'projects/x/services/z' }],
    ]);
    const result = buildResourceNameMaps([], persisted);
    expect(result.persistedNameToNodeId.get('bucket-1')).toBe('canvas-a');
    expect(result.persistedNameToNodeId.get('service-1')).toBe('canvas-c');
    expect(result.persistedNameToNodeId.size).toBe(2);
  });

  it('builds persistedProviderIdToNodeId only for entries that have a providerId', () => {
    const persisted = new Map<string, PersistedMappingEntry>([
      ['canvas-a', { name: 'bucket-1' }], // no providerId
      ['canvas-b', { providerId: 'projects/x/services/y' }],
      ['canvas-c', { name: 'service-1', providerId: 'projects/x/services/z' }],
    ]);
    const result = buildResourceNameMaps([], persisted);
    expect(result.persistedProviderIdToNodeId.get('projects/x/services/y')).toBe('canvas-b');
    expect(result.persistedProviderIdToNodeId.get('projects/x/services/z')).toBe('canvas-c');
    expect(result.persistedProviderIdToNodeId.size).toBe(2);
  });

  it('combines current translation and persisted entries independently', () => {
    const deployables: DeployableForResourceMaps[] = [
      { resource_type: 'storage_bucket', resource_name: 'bucket-1', node_id: 'canvas-a' },
    ];
    const persisted = new Map<string, PersistedMappingEntry>([
      ['canvas-old', { name: 'old-name', providerId: 'projects/x/buckets/old' }],
    ]);
    const result = buildResourceNameMaps(deployables, persisted);
    expect(result.nameToNodeId.get('bucket-1')).toBe('canvas-a');
    expect(result.persistedNameToNodeId.get('old-name')).toBe('canvas-old');
    expect(result.persistedProviderIdToNodeId.get('projects/x/buckets/old')).toBe('canvas-old');
  });

  it('treats deployables = undefined-ish (null-coalesces to empty iteration)', () => {
    // The implementation guards `for (const d of deployables || [])` so a
    // degenerate input doesn't throw. Useful when the translator returns
    // an absent `deployables` field on a no-op plan.
    const result = buildResourceNameMaps(undefined as unknown as DeployableForResourceMaps[], new Map());
    expect(result.nameToNodeId.size).toBe(0);
    expect(result.graphIdToCanvasId.size).toBe(0);
  });
});

describe('makeFindSourceNodeId', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Restore-and-respy each test so call counts don't accumulate across
    // describe-block siblings (vi.spyOn persists by default).
    vi.restoreAllMocks();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('matches a result by exact res.name against the current translation', () => {
    const find = makeFindSourceNodeId({
      nameToNodeId: new Map([['bucket-1', 'canvas-a']]),
      persistedNameToNodeId: new Map(),
      persistedProviderIdToNodeId: new Map(),
      cardId: 'card-12345678abcdef',
    });
    expect(find({ name: 'bucket-1' })).toBe('canvas-a');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('matches a result by exact res.resource_id when res.name is absent', () => {
    const find = makeFindSourceNodeId({
      nameToNodeId: new Map([['service-1', 'canvas-b']]),
      persistedNameToNodeId: new Map(),
      persistedProviderIdToNodeId: new Map(),
      cardId: 'card-12345678abcdef',
    });
    expect(find({ resource_id: 'service-1' })).toBe('canvas-b');
  });

  it('strips a trailing -0 / -1 suffix to find the base name', () => {
    const find = makeFindSourceNodeId({
      nameToNodeId: new Map([['foo-bucket', 'canvas-foo']]),
      persistedNameToNodeId: new Map(),
      persistedProviderIdToNodeId: new Map(),
      cardId: 'card-12345678abcdef',
    });
    expect(find({ name: 'foo-bucket-0' })).toBe('canvas-foo');
    expect(find({ name: 'foo-bucket-1' })).toBe('canvas-foo');
  });

  it('strips multiple suffix segments until a known base name is found', () => {
    const find = makeFindSourceNodeId({
      nameToNodeId: new Map([['foo', 'canvas-foo']]),
      persistedNameToNodeId: new Map(),
      persistedProviderIdToNodeId: new Map(),
      cardId: 'card-12345678abcdef',
    });
    // foo-bucket-0 → foo-bucket → foo (only "foo" is in the map)
    expect(find({ name: 'foo-bucket-0' })).toBe('canvas-foo');
  });

  it('strips handler suffixes like -proxy and -url-map', () => {
    const find = makeFindSourceNodeId({
      nameToNodeId: new Map([['lb-1', 'canvas-lb']]),
      persistedNameToNodeId: new Map(),
      persistedProviderIdToNodeId: new Map(),
      cardId: 'card-12345678abcdef',
    });
    expect(find({ name: 'lb-1-proxy' })).toBe('canvas-lb');
    expect(find({ name: 'lb-1-url-map' })).toBe('canvas-lb');
  });

  it('falls through to persisted provider_id when the current translation has no match', () => {
    const find = makeFindSourceNodeId({
      nameToNodeId: new Map(),
      persistedNameToNodeId: new Map(),
      persistedProviderIdToNodeId: new Map([['projects/x/buckets/abc', 'canvas-old']]),
      cardId: 'card-12345678abcdef',
    });
    expect(find({ name: 'renamed-bucket', provider_id: 'projects/x/buckets/abc' })).toBe('canvas-old');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('reads provider_id from either res.provider_id or res.providerId', () => {
    const find = makeFindSourceNodeId({
      nameToNodeId: new Map(),
      persistedNameToNodeId: new Map(),
      persistedProviderIdToNodeId: new Map([['p-1', 'canvas-x']]),
      cardId: 'card-12345678abcdef',
    });
    expect(find({ name: 'foo', provider_id: 'p-1' })).toBe('canvas-x');
    expect(find({ name: 'foo', providerId: 'p-1' })).toBe('canvas-x');
  });

  it('falls through to persisted name when neither translation nor provider_id match', () => {
    const find = makeFindSourceNodeId({
      nameToNodeId: new Map(),
      persistedNameToNodeId: new Map([['legacy-bucket', 'canvas-legacy']]),
      persistedProviderIdToNodeId: new Map(),
      cardId: 'card-12345678abcdef',
    });
    expect(find({ name: 'legacy-bucket' })).toBe('canvas-legacy');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('prefers persisted provider_id over persisted name when both could match different nodes', () => {
    const find = makeFindSourceNodeId({
      nameToNodeId: new Map(),
      persistedNameToNodeId: new Map([['ambiguous', 'canvas-by-name']]),
      persistedProviderIdToNodeId: new Map([['stable-id', 'canvas-by-id']]),
      cardId: 'card-12345678abcdef',
    });
    // provider_id wins because it's tier 3, name is tier 4
    expect(find({ name: 'ambiguous', provider_id: 'stable-id' })).toBe('canvas-by-id');
  });

  it('returns undefined and warns when nothing matches', () => {
    const find = makeFindSourceNodeId({
      nameToNodeId: new Map([['known', 'canvas-known']]),
      persistedNameToNodeId: new Map(),
      persistedProviderIdToNodeId: new Map(),
      cardId: 'card-12345678abcdef',
    });
    expect(find({ name: 'unknown', provider_id: 'unknown-id' })).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const msg = String(warnSpy.mock.calls[0]?.[0] ?? '');
    expect(msg).toContain('[deploy] findSourceNodeId: no match');
    expect(msg).toContain('name=unknown');
    expect(msg).toContain('provider_id=unknown-id');
  });

  it('emits the warn with `?` for missing provider_id and the cardId.slice(0,8) prefix', () => {
    const find = makeFindSourceNodeId({
      nameToNodeId: new Map(),
      persistedNameToNodeId: new Map(),
      persistedProviderIdToNodeId: new Map(),
      cardId: 'abcd1234ef5678ghij',
    });
    expect(find({ name: 'orphan' })).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const msg = String(warnSpy.mock.calls[0]?.[0] ?? '');
    expect(msg).toContain('provider_id=?');
    // cardId.slice(0, 8) is the first 8 chars only
    expect(msg).toContain('card=abcd1234');
    expect(msg).not.toContain('card=abcd1234ef');
    // Reassure ops the canvas-side consequence is logged
    expect(msg).toContain('Canvas block will not receive a deploy_status overlay.');
  });

  it('returns undefined for a result with no name and no provider_id', () => {
    const find = makeFindSourceNodeId({
      nameToNodeId: new Map(),
      persistedNameToNodeId: new Map(),
      persistedProviderIdToNodeId: new Map(),
      cardId: 'card-12345678abcdef',
    });
    expect(find({})).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('handles a null-ish res defensively by warning instead of throwing', () => {
    const find = makeFindSourceNodeId({
      nameToNodeId: new Map(),
      persistedNameToNodeId: new Map(),
      persistedProviderIdToNodeId: new Map(),
      cardId: 'card-12345678abcdef',
    });
    expect(() => find(null)).not.toThrow();
    expect(find(undefined)).toBeUndefined();
  });
});
