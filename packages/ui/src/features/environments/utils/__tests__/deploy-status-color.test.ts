/**
 * rf-etabs-1 — getDeployStatusDotColor unit tests.
 */

import { describe, it, expect } from 'vitest';
import { getDeployStatusDotColor } from '../deploy-status-color';

describe('getDeployStatusDotColor', () => {
  it('returns emerald for success', () => {
    expect(getDeployStatusDotColor({ status: 'success' })).toBe('bg-emerald-500');
  });

  it('returns blue + animate-pulse for deploying', () => {
    expect(getDeployStatusDotColor({ status: 'deploying' })).toBe('bg-blue-500 animate-pulse');
  });

  it('returns red for failed', () => {
    expect(getDeployStatusDotColor({ status: 'failed' })).toBe('bg-red-500');
  });

  it('returns amber + animate-pulse for planning', () => {
    expect(getDeployStatusDotColor({ status: 'planning' })).toBe('bg-amber-500 animate-pulse');
  });

  it('returns amber + animate-pulse for queued', () => {
    expect(getDeployStatusDotColor({ status: 'queued' })).toBe('bg-amber-500 animate-pulse');
  });

  it('returns the muted fallback for an unknown status', () => {
    expect(getDeployStatusDotColor({ status: 'unknown' })).toBe('bg-ice-text-3/30');
  });

  it('returns the muted fallback when deployStatus is undefined', () => {
    expect(getDeployStatusDotColor(undefined)).toBe('bg-ice-text-3/30');
  });

  it('returns the muted fallback when deployStatus.status is undefined', () => {
    expect(getDeployStatusDotColor({})).toBe('bg-ice-text-3/30');
  });
});
