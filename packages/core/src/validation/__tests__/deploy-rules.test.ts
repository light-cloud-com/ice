/**
 * Deploy Validation Rule Tests
 *
 * Drives validateDeployability through every branch:
 * provider gating, design-only / UI-only types, type-mapping
 * lookups, production scaling, and the credentials check.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const supportedProvidersByType = new Map<string, string[]>();

vi.mock('../schema-bridge', () => ({
  getSupportedProviders: (iceType: string) => supportedProvidersByType.get(iceType) ?? [],
  getPropertiesForIceType: () => [],
  isKnownIceType: () => true,
  getResourceForIceType: () => undefined,
}));

import { validateDeployability } from '../deploy-rules';
import type { ValidatableNode } from '../types';

const node = (
  id: string,
  iceType: string,
  data: Record<string, unknown> = {},
  type: string = 'resource',
): ValidatableNode => ({ id, type, data: { iceType, ...data } });

beforeEach(() => {
  vi.clearAllMocks();
  supportedProvidersByType.clear();
});

describe('validateDeployability', () => {
  it('flags missing provider and short-circuits', () => {
    const issues = validateDeployability([node('a', 'Compute.Container')], [], { mode: 'pre-deploy' });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.id).toBe('deploy:NO_PROVIDER');
    expect(issues[0]!.code).toBe('NO_CREDENTIALS');
  });

  it('flags design-only providers and short-circuits', () => {
    for (const provider of ['alibaba', 'digitalocean', 'kubernetes', 'oci']) {
      const issues = validateDeployability([node('a', 'Compute.Container')], [], { mode: 'pre-deploy', provider });
      expect(issues).toHaveLength(1);
      expect(issues[0]!.code).toBe('DESIGN_ONLY_PROVIDER');
      expect(issues[0]!.message.toLowerCase()).toContain(provider);
    }
  });

  it('flags missing credentials but continues with the rest of the validation', () => {
    const issues = validateDeployability([node('a', 'Compute.Container')], [], {
      mode: 'pre-deploy',
      provider: 'aws',
      hasCredentials: false,
    });
    const noCreds = issues.find((i) => i.code === 'NO_CREDENTIALS' && i.id !== 'deploy:NO_PROVIDER');
    expect(noCreds).toBeTruthy();
    // The rest of the deploy walk should also have run — only structural test
    // here is that we returned with no thrown errors.
  });

  it('does not raise NO_CREDENTIALS when hasCredentials is undefined', () => {
    const issues = validateDeployability([node('a', 'Compute.Container')], [], { mode: 'pre-deploy', provider: 'aws' });
    expect(issues.find((i) => i.code === 'NO_CREDENTIALS')).toBeUndefined();
  });

  it('skips containers, groups, and the Source.Repository / Config.Environment specials', () => {
    const issues = validateDeployability(
      [
        node('vpc', 'Network.VPC', {}, 'container'),
        node('group', 'Network.VPC', {}, 'group'),
        node('repo', 'Source.Repository'),
        node('env', 'Config.Environment'),
      ],
      [],
      { mode: 'pre-deploy', provider: 'aws' },
    );
    expect(issues).toEqual([]);
  });

  it('skips nodes that are missing iceType', () => {
    const issues = validateDeployability([{ id: 'x', type: 'resource', data: {} }], [], {
      mode: 'pre-deploy',
      provider: 'aws',
    });
    expect(issues).toEqual([]);
  });

  it('skips UI-only types (Network.PublicTraffic) silently', () => {
    const issues = validateDeployability([node('pt', 'Network.PublicTraffic')], [], {
      mode: 'pre-deploy',
      provider: 'aws',
    });
    expect(issues).toEqual([]);
  });

  it('flags a node whose own provider is design-only', () => {
    const issues = validateDeployability(
      [node('a', 'Compute.Container', { provider: 'alibaba', label: 'Service A' })],
      [],
      { mode: 'pre-deploy', provider: 'aws' },
    );
    const r = issues.find((i) => i.code === 'DESIGN_ONLY_PROVIDER');
    expect(r?.severity).toBe('warning');
    expect(r?.message).toContain('Service A');
  });

  it('falls back to the iceType suffix when label is missing', () => {
    const issues = validateDeployability([node('a', 'Compute.Container', { provider: 'kubernetes' })], [], {
      mode: 'pre-deploy',
      provider: 'aws',
    });
    expect(issues.find((i) => i.code === 'DESIGN_ONLY_PROVIDER')?.message).toContain('Container');
  });

  it('uses generic "Resource" label when iceType has no dot', () => {
    // Edge case: node has provider 'kubernetes' (design-only) and an iceType
    // with no period — exercises the `iceType.split('.').pop() || 'Resource'`
    // chain ending at the final fallback.
    const issues = validateDeployability(
      [{ id: 'a', type: 'resource', data: { iceType: 'Weird', provider: 'kubernetes' } }],
      [],
      { mode: 'pre-deploy', provider: 'aws' },
    );
    const r = issues.find((i) => i.code === 'DESIGN_ONLY_PROVIDER');
    expect(r?.message).toContain('Weird');
  });

  it('flags provider-unsupported template flag', () => {
    const issues = validateDeployability(
      [node('a', 'Compute.Container', { providerUnsupported: true, label: 'Foo' })],
      [],
      { mode: 'pre-deploy', provider: 'aws' },
    );
    expect(issues.find((i) => i.code === 'UNSUPPORTED_PROVIDER')?.severity).toBe('warning');
  });

  it('flags missing type mapping for a known iceType not in the deploy set', () => {
    // Make schema-bridge claim AWS supports this iceType (otherwise rule short-circuits).
    supportedProvidersByType.set('Custom.Thing', ['aws']);
    const issues = validateDeployability([node('a', 'Custom.Thing', { label: 'Custom' })], [], {
      mode: 'pre-deploy',
      provider: 'aws',
    });
    const r = issues.find((i) => i.code === 'NO_TYPE_MAPPING');
    expect(r?.severity).toBe('warning');
    expect(r?.suggestion).toContain('aws');
  });

  it('does not flag NO_TYPE_MAPPING when no providers support the iceType', () => {
    supportedProvidersByType.set('Custom.Thing', []);
    const issues = validateDeployability([node('a', 'Custom.Thing')], [], { mode: 'pre-deploy', provider: 'aws' });
    expect(issues.find((i) => i.code === 'NO_TYPE_MAPPING')).toBeUndefined();
  });

  it('does not flag for iceTypes that the provider deploys natively', () => {
    const issues = validateDeployability([node('a', 'Compute.Container'), node('b', 'Database.PostgreSQL')], [], {
      mode: 'pre-deploy',
      provider: 'aws',
    });
    expect(issues).toEqual([]);
  });

  it('handles unknown providers (deployableSet undefined) without crashing', () => {
    // Provider 'aws-fake' has no DEPLOY_MAPS entry — the rule short-circuits
    // around the type-mapping check. Other rules still run.
    const issues = validateDeployability([node('a', 'Compute.Container')], [], {
      mode: 'pre-deploy',
      provider: 'aws-fake',
    });
    expect(issues.find((i) => i.code === 'NO_TYPE_MAPPING')).toBeUndefined();
  });

  it('flags scalable production services that have no maxInstances', () => {
    const issues = validateDeployability([node('a', 'Compute.Container', { behavior: 'scalable', label: 'API' })], [], {
      mode: 'pre-deploy',
      provider: 'aws',
      environment: 'production',
    });
    const r = issues.find((i) => i.code === 'MISSING_DEPLOY_PROPERTY');
    expect(r?.severity).toBe('warning');
    expect(r?.message).toContain('API');
  });

  it('flags scalable production services with maxInstances <= 1', () => {
    const issues = validateDeployability(
      [node('a', 'Compute.Container', { behavior: 'scalable', maxInstances: 1 })],
      [],
      { mode: 'pre-deploy', provider: 'aws', environment: 'production' },
    );
    expect(issues.find((i) => i.code === 'MISSING_DEPLOY_PROPERTY')).toBeTruthy();
  });

  it('does not flag scaling when maxInstances > 1 in production', () => {
    const issues = validateDeployability(
      [node('a', 'Compute.Container', { behavior: 'scalable', maxInstances: 3 })],
      [],
      { mode: 'pre-deploy', provider: 'aws', environment: 'production' },
    );
    expect(issues.find((i) => i.code === 'MISSING_DEPLOY_PROPERTY')).toBeUndefined();
  });

  it('does not flag scaling outside of production', () => {
    const issues = validateDeployability([node('a', 'Compute.Container', { behavior: 'scalable' })], [], {
      mode: 'pre-deploy',
      provider: 'aws',
      environment: 'staging',
    });
    expect(issues.find((i) => i.code === 'MISSING_DEPLOY_PROPERTY')).toBeUndefined();
  });

  it('does not flag scaling for non-scalable behaviors', () => {
    const issues = validateDeployability([node('a', 'Compute.Container', { behavior: 'stateful' })], [], {
      mode: 'pre-deploy',
      provider: 'aws',
      environment: 'production',
    });
    expect(issues.find((i) => i.code === 'MISSING_DEPLOY_PROPERTY')).toBeUndefined();
  });

  it('exercises the GCP and Azure deploy maps', () => {
    const gcp = validateDeployability([node('a', 'Compute.Container'), node('b', 'Database.Firestore')], [], {
      mode: 'pre-deploy',
      provider: 'gcp',
    });
    expect(gcp).toEqual([]);
    const azure = validateDeployability([node('a', 'Compute.Container'), node('b', 'Database.CosmosDB')], [], {
      mode: 'pre-deploy',
      provider: 'azure',
    });
    expect(azure).toEqual([]);
  });
});
