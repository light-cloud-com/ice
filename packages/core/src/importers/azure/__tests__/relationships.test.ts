/**
 * Tests for Azure relationship inference.
 *
 * Each test wires up minimal AzureImportedResource records (only the
 * fields the inference function reads) and asserts that scanning the
 * properties payload turns up the expected `dependencies` rows.
 */

import { describe, expect, it } from 'vitest';
import { infer_relationships } from '../relationships';
import type { AzureImportedResource } from '../types';

function mkResource(id: string, properties: Record<string, unknown>): AzureImportedResource {
  return {
    azure_id: id,
    azure_type: 'Microsoft.Test/things',
    ice_type: 'azure.test.thing',
    name: id.split('/').pop() ?? 'x',
    location: 'eastus',
    resource_group: 'rg',
    subscription_id: 'sub',
    properties,
    tags: {},
    dependencies: [],
  } as AzureImportedResource;
}

describe('infer_relationships (Azure)', () => {
  it('adds a dependency when a string property points at another resource id', () => {
    const target = mkResource(
      '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa1',
      {},
    );
    const source = mkResource('/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app1', {
      storage_account_id: target.azure_id,
    });
    infer_relationships([target, source], []);
    expect(source.dependencies).toContain(target.azure_id);
  });

  it('treats nested objects + arrays as scannable', () => {
    const target = mkResource('/subscriptions/sub/resourceGroups/rg/providers/Microsoft.KeyVault/vaults/kv', {});
    const source = mkResource('/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app1', {
      identity: { references: [{ value: target.azure_id }] },
    });
    infer_relationships([target, source], []);
    expect(source.dependencies).toContain(target.azure_id);
  });

  it('matches case-insensitively (Azure ARM is case-insensitive on resource IDs)', () => {
    const target = mkResource(
      '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/sa1',
      {},
    );
    const source = mkResource('/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app1', {
      storage_account_id: target.azure_id.toLowerCase(),
    });
    infer_relationships([target, source], []);
    expect(source.dependencies).toContain(target.azure_id);
  });

  it('skips self-references (a resource never depends on itself)', () => {
    const self = mkResource('/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Test/things/x', {
      back_ref: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Test/things/x',
    });
    infer_relationships([self], []);
    expect(self.dependencies).toEqual([]);
  });

  it("ignores strings that don't look like resource IDs", () => {
    const source = mkResource('/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app1', {
      name: 'whatever',
      tags: { environment: 'prod' },
    });
    infer_relationships([source], []);
    expect(source.dependencies).toEqual([]);
  });

  it('deduplicates dependencies (multiple property mentions still count once)', () => {
    const target = mkResource('/subscriptions/sub/resourceGroups/rg/providers/Microsoft.KeyVault/vaults/kv', {});
    const source = mkResource('/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app1', {
      first_ref: target.azure_id,
      second_ref: target.azure_id,
      nested: { third: [target.azure_id] },
    });
    infer_relationships([target, source], []);
    expect(source.dependencies.filter((d) => d === target.azure_id)).toHaveLength(1);
  });
});
