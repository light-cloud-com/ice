/**
 * Unit tests for card-translator type maps and translation
 */

import { describe, it, expect } from 'vitest';

describe('Card Translator Type Maps', () => {
  // We test the type maps by importing and verifying their contents
  // The actual translate_card_to_graph function requires MutableGraph which is complex to mock

  describe('GCP Type Map', () => {
    it('should map Messaging.Topic to pubsub (not dataflow)', async () => {
      // ENGINE-15: Messaging.Topic was incorrectly mapped to gcp.dataflow.job
      const mod = await import('../deploy/card-translator');
      // Access via translate — check that Topic produces pubsub type
      const result = mod.translate_card_to_graph({
        nodes: [{ id: 'n1', type: 'resource', data: { iceType: 'Messaging.Topic', label: 'topic-1' } }],
        edges: [],
        provider: 'gcp',
        projectName: 'test',
      });
      // Should have 1 deployable node (not skipped)
      expect(result.deployable_count).toBe(1);
    });

    it('should map all standard GCP iceTypes', async () => {
      const mod = await import('../deploy/card-translator');
      // Security.Secret is intentionally absent here — it now expands per
      // binding, so a block with no bindings produces zero deployables and
      // a warning. Covered separately below.
      const gcpTypes = [
        'Compute.StaticSite',
        'Compute.Container',
        'Compute.ServerlessFunction',
        'Database.PostgreSQL',
        'Storage.Bucket',
        'Messaging.CloudPubSub',
        'AI.VectorDB',
      ];

      for (const iceType of gcpTypes) {
        const result = mod.translate_card_to_graph({
          nodes: [{ id: 'n1', type: 'resource', data: { iceType, label: 'test' } }],
          edges: [],
          provider: 'gcp',
          projectName: 'test',
        });
        expect(result.deployable_count).toBeGreaterThan(0);
      }
    });

    it('expands a Security.Secret block into one resource per unique binding', async () => {
      const mod = await import('../deploy/card-translator');
      const result = mod.translate_card_to_graph({
        nodes: [
          {
            id: 'sec1',
            type: 'resource',
            data: {
              iceType: 'Security.Secret',
              label: 'app-secrets',
              secrets: [
                { key: 'STRIPE_API_KEY', ref: 'prod-stripe-key' },
                { key: 'JWT_SECRET' }, // ref blank → falls back to key
                { key: 'STRIPE_API_KEY', ref: 'prod-stripe-key' }, // dup
              ],
            },
          },
        ],
        edges: [],
        provider: 'gcp',
        projectName: 'test',
      });
      // Dedup by `ref || key` collapses the duplicate.
      expect(result.deployable_count).toBe(2);
      const refs = result.deployables.map((d) => d.resource_name).sort();
      expect(refs).toEqual(['jwt-secret', 'prod-stripe-key']);
      // Every emitted deployable still attributes back to the source block.
      expect(result.deployables.every((d) => d.node_id === 'sec1')).toBe(true);
      // Each deployable label carries the binding key for plan-UI clarity.
      expect(result.deployables.some((d) => d.label.includes('STRIPE_API_KEY'))).toBe(true);
      expect(result.deployables.some((d) => d.label.includes('JWT_SECRET'))).toBe(true);
    });

    it('warns and skips when a Security.Secret block has no bindings', async () => {
      const mod = await import('../deploy/card-translator');
      const result = mod.translate_card_to_graph({
        nodes: [{ id: 'sec1', type: 'resource', data: { iceType: 'Security.Secret', label: 'empty-store' } }],
        edges: [],
        provider: 'gcp',
        projectName: 'test',
      });
      expect(result.deployable_count).toBe(0);
      expect(result.warnings.some((w) => w.includes('empty-store'))).toBe(true);
      expect(result.skipped.some((s) => s.nodeId === 'sec1')).toBe(true);
    });

    it('dedupes shared refs across multiple Security.Secret blocks', async () => {
      const mod = await import('../deploy/card-translator');
      const result = mod.translate_card_to_graph({
        nodes: [
          {
            id: 'sec1',
            type: 'resource',
            data: {
              iceType: 'Security.Secret',
              label: 'app',
              secrets: [{ key: 'DB_PASSWORD', ref: 'shared-db' }],
            },
          },
          {
            id: 'sec2',
            type: 'resource',
            data: {
              iceType: 'Security.Secret',
              label: 'worker',
              secrets: [{ key: 'DB_PASSWORD', ref: 'shared-db' }],
            },
          },
        ],
        edges: [],
        provider: 'gcp',
        projectName: 'test',
      });
      // One cloud secret, attributed to whichever block emitted it first.
      expect(result.deployable_count).toBe(1);
      expect(result.deployables[0].resource_name).toBe('shared-db');
    });
  });

  describe.skip('AWS Type Map', () => {
    // AWS deploy path is not yet wired up — PROPERTY_EXTRACTORS only covers
    // GCP resource types today. Unskip when AWS extractors land.
    it('should map AWS iceTypes (ENGINE-1)', async () => {
      const mod = await import('../deploy/card-translator');
      const awsTypes = [
        'Compute.Container',
        'Compute.ServerlessFunction',
        'Database.PostgreSQL',
        'Storage.Bucket',
        'Messaging.Queue',
      ];

      for (const iceType of awsTypes) {
        const result = mod.translate_card_to_graph({
          nodes: [{ id: 'n1', type: 'resource', data: { iceType, label: 'test' } }],
          edges: [],
          provider: 'aws',
          projectName: 'test',
        });
        expect(result.deployable_count).toBeGreaterThan(0);
      }
    });

    it('should not return empty results for AWS anymore', async () => {
      const mod = await import('../deploy/card-translator');
      const result = mod.translate_card_to_graph({
        nodes: [{ id: 'n1', type: 'resource', data: { iceType: 'Compute.Container', label: 'app' } }],
        edges: [],
        provider: 'aws',
        projectName: 'test',
      });
      expect(result.deployable_count).toBe(1);
    });
  });

  describe.skip('Azure Type Map', () => {
    // Azure deploy path not yet wired up — unskip when extractors land.
    it('should map Azure iceTypes (ENGINE-2)', async () => {
      const mod = await import('../deploy/card-translator');
      const result = mod.translate_card_to_graph({
        nodes: [
          { id: 'n1', type: 'resource', data: { iceType: 'Compute.Container', label: 'app' } },
          { id: 'n2', type: 'resource', data: { iceType: 'Database.PostgreSQL', label: 'db' } },
        ],
        edges: [],
        provider: 'azure',
        projectName: 'test',
      });
      expect(result.deployable_count).toBe(2);
    });
  });

  describe('Design-only providers (ENGINE-3)', () => {
    it('should emit warning for unsupported providers', async () => {
      const mod = await import('../deploy/card-translator');

      for (const provider of ['alibaba', 'digitalocean', 'kubernetes']) {
        const result = mod.translate_card_to_graph({
          nodes: [{ id: 'n1', type: 'resource', data: { iceType: 'Compute.Container', label: 'app' } }],
          edges: [],
          provider: provider as any,
          projectName: 'test',
        });
        expect(result.warnings.some((w: string) => w.includes('design-only'))).toBe(true);
      }
    });
  });

  describe('UI-only and group nodes', () => {
    it('should skip group nodes', async () => {
      const mod = await import('../deploy/card-translator');
      const result = mod.translate_card_to_graph({
        nodes: [{ id: 'n1', type: 'group', data: { label: 'VPC' } }],
        edges: [],
        provider: 'gcp',
        projectName: 'test',
      });
      expect(result.deployable_count).toBe(0);
      expect(result.skipped.length).toBe(1);
    });

    it('should skip UI-only types', async () => {
      const mod = await import('../deploy/card-translator');
      const result = mod.translate_card_to_graph({
        nodes: [{ id: 'n1', type: 'resource', data: { iceType: 'Monitoring.Terminal', label: 'logs' } }],
        edges: [],
        provider: 'gcp',
        projectName: 'test',
      });
      expect(result.deployable_count).toBe(0);
    });

    it('translates Monitoring.Log to a Cloud Logging sink graph node (LT-1 consolidation)', async () => {
      // Regression for LT-1: Monitoring.Log MUST compile to a real cloud
      // resource (gcp.logging.sink), not be silently skipped as UI-only.
      // If a future agent re-adds Monitoring.Log to UI_ONLY_TYPES thinking
      // "the canvas block is just a viewer now", this test fails loudly.
      // The sink resource identifier here must stay aligned with the
      // handler at packages/core/src/deploy/providers/gcp/handlers/logging.ts
      // and with the LT-3 filter resolver's resource-type expectations.
      const mod = await import('../deploy/card-translator');
      const result = mod.translate_card_to_graph({
        nodes: [{ id: 'log-1', type: 'resource', data: { iceType: 'Monitoring.Log', label: 'app-logs' } }],
        edges: [],
        provider: 'gcp',
        projectName: 'test',
      });
      expect(result.deployable_count).toBe(1);
      expect(result.deployables).toHaveLength(1);
      expect(result.deployables[0]).toMatchObject({
        ice_type: 'Monitoring.Log',
        resource_type: 'gcp.logging.sink',
      });
      expect(result.skipped.find((s) => s.nodeId === 'log-1')).toBeUndefined();
    });
  });
});
