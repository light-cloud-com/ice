/**
 * spotlight-spawn — provider resolution (CD1) + fallback node data (CD5).
 */

import { describe, it, expect, vi } from 'vitest';
import { resolveSpotlightProvider, buildSpotlightFallbackData } from '../spotlight-spawn';

const allow = () => true;
const deny = () => false;

describe('resolveSpotlightProvider (CD1)', () => {
  it('prefers the active deploy provider when the block supports it', () => {
    const r = resolveSpotlightProvider('Compute.Container', ['aws', 'gcp'], 'gcp', allow);
    expect(r.effectiveProvider).toBe('gcp');
    expect(r.gateBlocked).toBe(false);
  });

  it('falls back to the first listed provider when the deploy provider is unsupported', () => {
    const r = resolveSpotlightProvider('Compute.Container', ['aws', 'gcp'], 'azure', allow);
    expect(r.effectiveProvider).toBe('aws');
  });

  it('uses the deploy provider when the block lists none', () => {
    const r = resolveSpotlightProvider('Compute.Container', [], 'aws', allow);
    expect(r.effectiveProvider).toBe('aws');
  });

  it('yields undefined provider when there is neither a list nor a deploy provider', () => {
    const r = resolveSpotlightProvider('Compute.Container', [], undefined, allow);
    expect(r.effectiveProvider).toBeUndefined();
    expect(r.gateBlocked).toBe(false);
  });

  it('reports gateBlocked when the block is not enabled for the resolved provider', () => {
    const r = resolveSpotlightProvider('Compute.Container', ['aws'], 'aws', deny);
    expect(r.effectiveProvider).toBe('aws');
    expect(r.gateBlocked).toBe(true);
  });

  it('passes the resolved provider (not the deploy provider) to the enablement check', () => {
    const isEnabled = vi.fn(() => true);
    // deploy provider azure is unsupported → resolves to aws → that is checked.
    resolveSpotlightProvider('Compute.Container', ['aws', 'gcp'], 'azure', isEnabled);
    expect(isEnabled).toHaveBeenCalledWith('Compute.Container', 'aws');
  });
});

describe('buildSpotlightFallbackData (CD5)', () => {
  const cmd = { name: 'My Block', iceType: 'Compute.Container' };

  it('stamps the resolved effectiveProvider (not the raw deploy provider)', () => {
    const data = buildSpotlightFallbackData(cmd, 'aws', false);
    expect(data.provider).toBe('aws');
    expect(data.label).toBe('My Block');
    expect(data.iceType).toBe('Compute.Container');
  });

  it('flags providerUnsupported when gate-blocked (matches the drag path)', () => {
    const data = buildSpotlightFallbackData(cmd, 'aws', true);
    expect(data.providerUnsupported).toBe(true);
  });

  it('omits providerUnsupported when not gate-blocked', () => {
    const data = buildSpotlightFallbackData(cmd, 'aws', false);
    expect('providerUnsupported' in data).toBe(false);
  });
});
