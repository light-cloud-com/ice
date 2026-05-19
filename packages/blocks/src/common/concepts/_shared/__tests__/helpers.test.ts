/**
 * Tests for the concepts-palette shared helpers.
 */

import { describe, it, expect } from 'vitest';
import { resolveProviderNodeData, supportsProvider } from '../helpers';
import type { BlockBlueprint, Provider } from '../../../../types';

const baseBlueprint: BlockBlueprint = {
  iceType: 'Compute.Container',
  resourceId: 'container-service',
  name: 'Container',
  description: 'A container',
  icon: 'Box',
  category: 'compute',
  providers: ['aws', 'gcp'] as Provider[],
  nodeData: { label: 'Container', size: 'small' },
};

describe('resolveProviderNodeData', () => {
  it('returns a fresh copy of base nodeData when no provider is given', () => {
    const out = resolveProviderNodeData(baseBlueprint, undefined);
    expect(out).toEqual({ label: 'Container', size: 'small' });
    expect(out).not.toBe(baseBlueprint.nodeData);
  });

  it('returns base nodeData when blueprint has no providerVariants', () => {
    const out = resolveProviderNodeData(baseBlueprint, 'aws');
    expect(out).toEqual({ label: 'Container', size: 'small' });
  });

  it('returns base nodeData when no variant matches the provider', () => {
    const bp = {
      ...baseBlueprint,
      providerVariants: [{ provider: 'azure' as Provider, dataOverrides: { label: 'Azure' } }],
    };
    const out = resolveProviderNodeData(bp, 'aws');
    expect(out).toEqual({ label: 'Container', size: 'small' });
  });

  it('returns base nodeData when matching variant has no dataOverrides', () => {
    const bp = {
      ...baseBlueprint,
      providerVariants: [{ provider: 'aws' as Provider }] as any,
    };
    const out = resolveProviderNodeData(bp, 'aws');
    expect(out).toEqual({ label: 'Container', size: 'small' });
  });

  it('merges overrides on top of base nodeData when variant matches', () => {
    const bp = {
      ...baseBlueprint,
      providerVariants: [{ provider: 'aws' as Provider, dataOverrides: { size: 'large', region: 'us-east-1' } }],
    };
    const out = resolveProviderNodeData(bp, 'aws');
    expect(out).toEqual({ label: 'Container', size: 'large', region: 'us-east-1' });
  });
});

describe('supportsProvider', () => {
  it('returns true when provider is in the blueprint list', () => {
    expect(supportsProvider(baseBlueprint, 'aws')).toBe(true);
    expect(supportsProvider(baseBlueprint, 'gcp')).toBe(true);
  });

  it('returns false when provider is not in the list', () => {
    expect(supportsProvider(baseBlueprint, 'azure')).toBe(false);
    expect(supportsProvider(baseBlueprint, 'kubernetes')).toBe(false);
  });
});
