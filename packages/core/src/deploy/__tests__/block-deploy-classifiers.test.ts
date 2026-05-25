/**
 * Tests for `block-deploy-classifiers` — the per-iceType flag table
 * the deploy-side classifiers read.
 *
 * Cardinal rule check: the table is the single declarative fact for
 * "this iceType isolates network context" and "this iceType has a
 * standalone/nested duality". Classifier code reads these flags
 * generically; it MUST NOT name a specific iceType.
 */

import { describe, it, expect } from 'vitest';
import { BLOCK_DEPLOY_CLASSIFIERS, getBlockDeployClassifiers } from '../block-deploy-classifiers';

describe('BLOCK_DEPLOY_CLASSIFIERS', () => {
  it('marks Network.PrivateNetwork as a network-isolation container', () => {
    expect(BLOCK_DEPLOY_CLASSIFIERS['Network.PrivateNetwork'].isolatesNetworkContext).toBe(true);
  });

  it('marks Network.CustomDomain as having standalone/nested duality', () => {
    expect(BLOCK_DEPLOY_CLASSIFIERS['Network.CustomDomain'].metadataOnlyWhenStandalone).toBe(true);
  });

  it('marks Network.PublicEndpoint as an always-public-ingress block', () => {
    expect(BLOCK_DEPLOY_CLASSIFIERS['Network.PublicEndpoint'].publicIngressMode).toBe('always');
  });

  it('marks Network.CustomDomain as ingress only when nested in an isolation container', () => {
    expect(BLOCK_DEPLOY_CLASSIFIERS['Network.CustomDomain'].publicIngressMode).toBe('when-nested-in-isolated-network');
  });

  it('marks Network.CustomDomain as the domain propagator', () => {
    expect(BLOCK_DEPLOY_CLASSIFIERS['Network.CustomDomain'].isDomainPropagator).toBe(true);
  });
});

describe('getBlockDeployClassifiers', () => {
  it('returns the registered entry when present', () => {
    expect(getBlockDeployClassifiers('Network.PrivateNetwork').isolatesNetworkContext).toBe(true);
  });

  it('returns an empty object for unknown iceTypes (safe to read flags)', () => {
    expect(getBlockDeployClassifiers('Wholly.Unknown')).toEqual({});
    expect(getBlockDeployClassifiers('').isolatesNetworkContext).toBeUndefined();
  });
});
