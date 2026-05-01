/**
 * Smoke tests for the rf-hlres-1 types extraction.
 *
 * Verifies that `./high-level-resources/types.ts` exposes every type
 * the public shim and the categories sub-modules need, and that the
 * shim still re-exports them under the original names.
 */

import { describe, expect, it } from 'vitest';
import * as ShimModule from '../high-level-resources.js';
import * as TypesModule from '../high-level-resources/types.js';
import type {
  HighLevelCategory,
  HighLevelProperty,
  HighLevelResource,
  NodeBehavior,
  OptionDetail,
  ProviderImplementation,
} from '../high-level-resources/types.js';

describe('high-level-resources/types — direct module imports', () => {
  it('module is loadable as a namespace', () => {
    // The module is type-only — namespace import returns an empty object
    // (TypeScript erases interface declarations).
    expect(typeof TypesModule).toBe('object');
  });

  it('declared types are usable in type positions', () => {
    // If these types are missing or renamed, this test fails to compile.
    const impl: ProviderImplementation = {
      provider: 'aws',
      resource_type: 'aws:s3:Bucket',
      display_name: 'S3 Bucket',
    };
    const opt: OptionDetail = { value: 'x', label: 'X' };
    const prop: HighLevelProperty = {
      name: 'p',
      label: 'P',
      type: 'string',
      required: false,
      description: 'd',
    };
    const res: HighLevelResource = {
      id: 'r',
      name: 'R',
      description: 'd',
      icon: 'i',
      category: 'c',
      behavior: 'service' as NodeBehavior,
      providers: ['aws'],
      implementations: [impl],
      keywords: [],
      properties: [prop],
    };
    const cat: HighLevelCategory = {
      id: 'cat',
      name: 'Cat',
      description: 'd',
      icon: 'i',
      resources: [res],
    };
    expect(cat.resources[0]?.implementations[0]?.provider).toBe('aws');
    expect(opt.value).toBe('x');
  });
});

describe('high-level-resources shim — re-exports types from sub-module', () => {
  it('re-exports the 5 types under the original names', () => {
    // Type-only re-exports cannot be inspected at runtime, so we exercise
    // them via structurally-typed values on the shim's named exports.
    // This compiles only when the shim re-exports each type by name.
    type _A = ShimModule.HighLevelCategory;
    type _B = ShimModule.HighLevelProperty;
    type _C = ShimModule.HighLevelResource;
    type _D = ShimModule.OptionDetail;
    type _E = ShimModule.ProviderImplementation;
    type _F = ShimModule.NodeBehavior;
    // Touch the local aliases to keep TS from pruning them.
    const _all: [_A, _B, _C, _D, _E, _F] | null = null;
    expect(_all).toBeNull();
  });

  it('shim still exposes HIGH_LEVEL_CATEGORIES with the 7 canonical category ids', () => {
    expect(Array.isArray(ShimModule.HIGH_LEVEL_CATEGORIES)).toBe(true);
    const ids = ShimModule.HIGH_LEVEL_CATEGORIES.map((c) => c.id);
    expect(ids).toEqual(['compute', 'database', 'storage', 'networking', 'messaging', 'security', 'monitoring']);
  });
});
