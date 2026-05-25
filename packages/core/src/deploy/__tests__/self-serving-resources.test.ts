/**
 * Tests for `self-serving-resources` — the set of provider resource
 * types that serve public traffic on their own and need no LB chain.
 *
 * Cardinal-rule check: the set is the schema-shaped fact. The
 * endpoint-wiring pass iterates it generically — there are no
 * iceType strings naming any specific block.
 */

import { describe, it, expect } from 'vitest';
import { SELF_SERVING_PUBLIC_RESOURCES, isSelfServingPublicResource } from '../self-serving-resources';

describe('SELF_SERVING_PUBLIC_RESOURCES', () => {
  it("includes GCP Firebase Hosting (today's only self-serving target)", () => {
    expect(SELF_SERVING_PUBLIC_RESOURCES.has('gcp.firebase.hosting')).toBe(true);
  });

  it('does NOT include Cloud Run, S3, or other "needs an LB" resources', () => {
    expect(SELF_SERVING_PUBLIC_RESOURCES.has('gcp.run.service')).toBe(false);
    expect(SELF_SERVING_PUBLIC_RESOURCES.has('aws.s3.bucket')).toBe(false);
    expect(SELF_SERVING_PUBLIC_RESOURCES.has('azure.containerapp.containerApp')).toBe(false);
  });
});

describe('isSelfServingPublicResource', () => {
  it('returns true for registered resource types', () => {
    expect(isSelfServingPublicResource('gcp.firebase.hosting')).toBe(true);
  });

  it('returns false for unregistered types', () => {
    expect(isSelfServingPublicResource('gcp.run.service')).toBe(false);
    expect(isSelfServingPublicResource('totally.unknown.type')).toBe(false);
    expect(isSelfServingPublicResource('')).toBe(false);
  });
});
