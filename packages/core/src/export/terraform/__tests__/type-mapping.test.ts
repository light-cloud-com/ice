/**
 * Tests for `terraform/type-mapping.ts` (rf-tfexp-3).
 *
 * Pure-function helper, hit 100% with input/output pinning.
 * Behaviour preserved verbatim from pre-extraction L335-362 of
 * `terraform-exporter.ts`.
 */
import { describe, expect, it } from 'vitest';
import { fallback_type_mapping } from '../type-mapping.js';

describe('fallback_type_mapping', () => {
  describe('gcp prefix', () => {
    it('converts gcp.compute.instance to google_compute_instance with provider gcp', () => {
      expect(fallback_type_mapping('gcp.compute.instance', 'gcp')).toBe('google_compute_instance');
    });

    it('converts gcp.* with provider google', () => {
      expect(fallback_type_mapping('gcp.compute.disk', 'google')).toBe('google_compute_disk');
    });

    it('uses tf_prefix from provider_prefix_map (gcp -> google)', () => {
      // The gcp branch substitutes whatever tf_prefix the caller mapped to.
      // For unrelated provider tokens, the gcp.* prefix is replaced by ${tf_prefix}_
      expect(fallback_type_mapping('gcp.compute.instance', 'aws')).toBe('aws_compute_instance');
    });

    it('handles deeper module paths', () => {
      expect(fallback_type_mapping('gcp.compute.network.peering', 'gcp')).toBe(
        'google_compute_network_peering',
      );
    });
  });

  describe('aws prefix', () => {
    it('converts aws.ec2.instance to aws_ec2_instance', () => {
      expect(fallback_type_mapping('aws.ec2.instance', 'aws')).toBe('aws_ec2_instance');
    });

    it('hard-codes aws_ prefix even with non-aws provider token', () => {
      // The aws branch is fixed to 'aws_' regardless of provider token.
      expect(fallback_type_mapping('aws.ec2.instance', 'gcp')).toBe('aws_ec2_instance');
    });

    it('handles deeper aws paths', () => {
      expect(fallback_type_mapping('aws.s3.bucket.policy', 'aws')).toBe('aws_s3_bucket_policy');
    });
  });

  describe('azure prefix', () => {
    it('converts azure.compute.virtual_machine to azurerm_compute_virtual_machine', () => {
      expect(fallback_type_mapping('azure.compute.virtual_machine', 'azure')).toBe(
        'azurerm_compute_virtual_machine',
      );
    });

    it('uses azurerm prefix with provider azurerm', () => {
      expect(fallback_type_mapping('azure.network.vnet', 'azurerm')).toBe('azurerm_network_vnet');
    });

    it('hard-codes azurerm_ prefix even with non-azure provider token', () => {
      expect(fallback_type_mapping('azure.compute.vm', 'gcp')).toBe('azurerm_compute_vm');
    });
  });

  describe('generic fallback', () => {
    it('uses tf_prefix for unknown ICE type prefix', () => {
      expect(fallback_type_mapping('foo.bar', 'gcp')).toBe('google_foo_bar');
    });

    it('falls through provider_prefix_map for direct provider', () => {
      expect(fallback_type_mapping('custom.resource.type', 'unknown')).toBe(
        'unknown_custom_resource_type',
      );
    });

    it('preserves dots-as-underscores in fallback', () => {
      expect(fallback_type_mapping('a.b.c.d', 'aws')).toBe('aws_a_b_c_d');
    });
  });

  describe('provider mapping table', () => {
    it('maps google -> google', () => {
      expect(fallback_type_mapping('foo.bar', 'google')).toBe('google_foo_bar');
    });

    it('maps gcp -> google', () => {
      expect(fallback_type_mapping('foo.bar', 'gcp')).toBe('google_foo_bar');
    });

    it('maps azure -> azurerm', () => {
      expect(fallback_type_mapping('foo.bar', 'azure')).toBe('azurerm_foo_bar');
    });

    it('maps azurerm -> azurerm', () => {
      expect(fallback_type_mapping('foo.bar', 'azurerm')).toBe('azurerm_foo_bar');
    });

    it('passes through unknown providers as identity', () => {
      expect(fallback_type_mapping('foo.bar', 'random')).toBe('random_foo_bar');
    });
  });
});
