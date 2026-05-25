/**
 * Tests for `internal-ingress-overrides` — per-provider mutations
 * applied when a service backend is nested inside a network-isolation
 * container.
 *
 * Cardinal-rule check: the table is the schema-shaped fact for
 * "how does provider X make a service internal?". Callers iterate
 * `applyInternalIngressOverride(resourceType, props)` generically;
 * no provider-specific branches in the translator remain.
 */

import { describe, it, expect } from 'vitest';
import { INTERNAL_INGRESS_OVERRIDES, applyInternalIngressOverride } from '../internal-ingress-overrides';

describe('INTERNAL_INGRESS_OVERRIDES', () => {
  it('registers the three providers that today have a service-backend type', () => {
    expect(Object.keys(INTERNAL_INGRESS_OVERRIDES).sort()).toEqual([
      'aws.ecs.service',
      'azure.containerapp.containerApp',
      'gcp.run.service',
    ]);
  });

  it('GCP Cloud Run override: ingress="internal-and-cloud-load-balancing" + allow_unauthenticated=false', () => {
    const props: Record<string, unknown> = {};
    INTERNAL_INGRESS_OVERRIDES['gcp.run.service'](props);
    expect(props.allow_unauthenticated).toBe(false);
    expect(props.ingress).toBe('internal-and-cloud-load-balancing');
  });

  it('AWS ECS override: assign_public_ip=false + internal=true', () => {
    const props: Record<string, unknown> = {};
    INTERNAL_INGRESS_OVERRIDES['aws.ecs.service'](props);
    expect(props.assign_public_ip).toBe(false);
    expect(props.internal).toBe(true);
  });

  it('Azure Container App override: ingress_external=false', () => {
    const props: Record<string, unknown> = {};
    INTERNAL_INGRESS_OVERRIDES['azure.containerapp.containerApp'](props);
    expect(props.ingress_external).toBe(false);
  });
});

describe('applyInternalIngressOverride', () => {
  it('applies the GCP override in place', () => {
    const props: Record<string, unknown> = { cpu: 2 };
    applyInternalIngressOverride('gcp.run.service', props);
    expect(props).toMatchObject({ cpu: 2, allow_unauthenticated: false });
  });

  it('is a no-op for resource types without a registered override', () => {
    const props: Record<string, unknown> = { foo: 'bar' };
    applyInternalIngressOverride('gcp.storage.bucket', props);
    applyInternalIngressOverride('totally.unknown.type', props);
    expect(props).toEqual({ foo: 'bar' });
  });
});
