/**
 * rf-pdpl-1 — `utils/provider-regions.ts` invariant tests.
 *
 * The module was lifted verbatim from `deploy-panel.tsx` (L71–138). These
 * tests pin the four exports' shapes and `detectDominantProvider`'s exact
 * fallback / tie-break behavior so any future "tidy up" of the helper
 * cannot silently change what the deploy panel reads at startup.
 */

import { describe, it, expect } from 'vitest';
import {
  PROVIDER_REGIONS,
  PROVIDER_LABELS,
  PROVIDER_PROJECT_LABELS,
  detectDominantProvider,
} from '../provider-regions';

describe('PROVIDER_REGIONS', () => {
  it('exposes the three providers the deploy panel offers regions for', () => {
    expect(Object.keys(PROVIDER_REGIONS).sort()).toEqual(['aws', 'azure', 'gcp']);
  });

  it('every provider has a non-empty region array', () => {
    for (const provider of Object.keys(PROVIDER_REGIONS)) {
      expect(PROVIDER_REGIONS[provider].length).toBeGreaterThan(0);
    }
  });

  it('the gcp default region (first in array) is us-central1', () => {
    // The deploy panel reads `regions[0]` as the auto-fill default when the
    // user has not picked a region yet (deploy-panel L181). Locking this
    // ensures a future re-order does not silently change new-card defaults.
    expect(PROVIDER_REGIONS.gcp[0]).toBe('us-central1');
  });

  it('the aws default region (first in array) is us-east-1', () => {
    expect(PROVIDER_REGIONS.aws[0]).toBe('us-east-1');
  });

  it('the azure default region (first in array) is eastus', () => {
    expect(PROVIDER_REGIONS.azure[0]).toBe('eastus');
  });
});

describe('PROVIDER_LABELS', () => {
  it('covers gcp, aws, azure, and kubernetes (kubernetes has no regions but does have a label)', () => {
    expect(Object.keys(PROVIDER_LABELS).sort()).toEqual(['aws', 'azure', 'gcp', 'kubernetes']);
  });

  it('renders the canonical short-form display labels', () => {
    expect(PROVIDER_LABELS.gcp).toBe('GCP');
    expect(PROVIDER_LABELS.aws).toBe('AWS');
    expect(PROVIDER_LABELS.azure).toBe('Azure');
    expect(PROVIDER_LABELS.kubernetes).toBe('Kubernetes');
  });
});

describe('PROVIDER_PROJECT_LABELS', () => {
  it('covers the same four providers as PROVIDER_LABELS', () => {
    expect(Object.keys(PROVIDER_PROJECT_LABELS).sort()).toEqual(['aws', 'azure', 'gcp', 'kubernetes']);
  });

  it('every entry has a label and a placeholder string', () => {
    for (const provider of Object.keys(PROVIDER_PROJECT_LABELS)) {
      const entry = PROVIDER_PROJECT_LABELS[provider];
      expect(typeof entry.label).toBe('string');
      expect(entry.label.length).toBeGreaterThan(0);
      expect(typeof entry.placeholder).toBe('string');
      expect(entry.placeholder.length).toBeGreaterThan(0);
    }
  });

  it('renders the canonical project-field metadata', () => {
    expect(PROVIDER_PROJECT_LABELS.gcp).toEqual({ label: 'GCP Project', placeholder: 'my-gcp-project' });
    expect(PROVIDER_PROJECT_LABELS.aws).toEqual({ label: 'AWS Account / Region', placeholder: '123456789012' });
    expect(PROVIDER_PROJECT_LABELS.azure).toEqual({
      label: 'Azure Subscription',
      placeholder: 'my-subscription-id',
    });
    expect(PROVIDER_PROJECT_LABELS.kubernetes).toEqual({
      label: 'Cluster Name',
      placeholder: 'my-k8s-cluster',
    });
  });
});

describe('detectDominantProvider', () => {
  it('returns "gcp" as the fallback when the nodes array is empty', () => {
    expect(detectDominantProvider([])).toBe('gcp');
  });

  it('returns "gcp" when no nodes are of type "resource" (non-resource types ignored)', () => {
    const nodes = [
      { type: 'group', data: { provider: 'aws' } },
      { type: 'block', data: { provider: 'azure' } },
      { type: 'connection', data: { provider: 'aws' } },
    ];
    expect(detectDominantProvider(nodes)).toBe('gcp');
  });

  it('returns "gcp" when all resource nodes have no data.provider field', () => {
    // Resource nodes without a provider should be ignored — leaving the
    // counts map empty, which falls through to the 'gcp' fallback.
    const nodes = [
      { type: 'resource', data: {} },
      { type: 'resource' }, // no data at all
      { type: 'resource', data: { provider: '' } }, // empty-string provider also ignored
    ];
    expect(detectDominantProvider(nodes)).toBe('gcp');
  });

  it('returns the only provider when exactly one resource node carries one', () => {
    const nodes = [{ type: 'resource', data: { provider: 'aws' } }];
    expect(detectDominantProvider(nodes)).toBe('aws');
  });

  it('returns the majority provider when one outnumbers the others', () => {
    const nodes = [
      { type: 'resource', data: { provider: 'aws' } },
      { type: 'resource', data: { provider: 'aws' } },
      { type: 'resource', data: { provider: 'aws' } },
      { type: 'resource', data: { provider: 'gcp' } },
      { type: 'resource', data: { provider: 'azure' } },
    ];
    expect(detectDominantProvider(nodes)).toBe('aws');
  });

  it('ignores non-resource nodes when counting provider occurrences', () => {
    // Two `gcp` resource nodes vs three `aws` non-resource nodes — `gcp` wins.
    const nodes = [
      { type: 'group', data: { provider: 'aws' } },
      { type: 'block', data: { provider: 'aws' } },
      { type: 'connection', data: { provider: 'aws' } },
      { type: 'resource', data: { provider: 'gcp' } },
      { type: 'resource', data: { provider: 'gcp' } },
    ];
    expect(detectDominantProvider(nodes)).toBe('gcp');
  });

  it('on a tie, the first-inserted provider wins (stable sort + insertion order)', () => {
    // Object.entries preserves insertion order, and Array.prototype.sort is
    // stable (per spec since ES2019). Equal-count entries keep their original
    // ordering, so the provider whose first node was encountered earlier in
    // the nodes array stays at index 0 and is returned.
    const azureFirst = [
      { type: 'resource', data: { provider: 'azure' } },
      { type: 'resource', data: { provider: 'aws' } },
      { type: 'resource', data: { provider: 'aws' } },
      { type: 'resource', data: { provider: 'azure' } },
    ];
    expect(detectDominantProvider(azureFirst)).toBe('azure');

    const awsFirst = [
      { type: 'resource', data: { provider: 'aws' } },
      { type: 'resource', data: { provider: 'azure' } },
      { type: 'resource', data: { provider: 'azure' } },
      { type: 'resource', data: { provider: 'aws' } },
    ];
    expect(detectDominantProvider(awsFirst)).toBe('aws');
  });

  it('counts mixed nodes correctly (resource provider tally only, non-resource skipped)', () => {
    const nodes = [
      { type: 'resource', data: { provider: 'gcp' } },
      { type: 'resource', data: {} }, // no provider — skipped
      { type: 'group', data: { provider: 'gcp' } }, // not a resource — skipped
      { type: 'resource', data: { provider: 'aws' } },
      { type: 'resource', data: { provider: 'aws' } },
    ];
    expect(detectDominantProvider(nodes)).toBe('aws');
  });
});
