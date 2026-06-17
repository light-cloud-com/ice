import { describe, it, expect } from 'vitest';
import { deployStatusMeta, deployStatusTone } from '../deploy-status';

describe('deployStatusMeta — canonical deploy-status vocabulary (IA4)', () => {
  it('treats error and failed as the same canonical "failed"', () => {
    expect(deployStatusMeta('error').tone).toBe('failed');
    expect(deployStatusMeta('failed').tone).toBe('failed');
    expect(deployStatusMeta('error').labelKey).toBe('deployStatus.failed');
    expect(deployStatusMeta('failed').labelKey).toBe('deployStatus.failed');
  });

  it('maps success → deployed', () => {
    expect(deployStatusMeta('success')).toMatchObject({
      tone: 'success',
      labelKey: 'deployStatus.deployed',
      dotClass: 'bg-emerald-500',
    });
  });

  it('buckets the in-progress states', () => {
    expect(deployStatusTone('deploying')).toBe('in-progress');
    expect(deployStatusTone('destroying')).toBe('in-progress');
  });

  it('buckets the pending states', () => {
    for (const s of ['planning', 'planned', 'queued', 'authenticating']) {
      expect(deployStatusTone(s)).toBe('pending');
    }
  });

  it('maps cancelled to its own tone', () => {
    expect(deployStatusMeta('cancelled').tone).toBe('cancelled');
    expect(deployStatusMeta('cancelled').labelKey).toBe('deployStatus.cancelled');
  });

  it('falls back to idle / not-deployed for unknown or missing input', () => {
    expect(deployStatusMeta(undefined)).toMatchObject({
      tone: 'idle',
      labelKey: 'deployStatus.notDeployed',
      dotClass: 'bg-ice-text-3/30',
    });
    expect(deployStatusMeta('whatever').tone).toBe('idle');
    expect(deployStatusMeta(null).labelKey).toBe('deployStatus.notDeployed');
  });

  it('preserves the env-util dot colours it now backs (regression guard)', () => {
    expect(deployStatusMeta('success').dotClass).toBe('bg-emerald-500');
    expect(deployStatusMeta('deploying').dotClass).toBe('bg-blue-500 animate-pulse');
    expect(deployStatusMeta('failed').dotClass).toBe('bg-red-500');
    expect(deployStatusMeta('planning').dotClass).toBe('bg-amber-500 animate-pulse');
    expect(deployStatusMeta('queued').dotClass).toBe('bg-amber-500 animate-pulse');
  });
});
