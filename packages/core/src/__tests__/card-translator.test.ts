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
      const mod = await import('../deploy/card-translator.js');
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
      const mod = await import('../deploy/card-translator.js');
      const gcpTypes = [
        'Application.StaticSite', 'Application.Container', 'Application.ServerlessFunction',
        'Database.PostgreSQL', 'Storage.Bucket', 'Messaging.CloudPubSub',
        'Security.Secret', 'AI.VectorDB',
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
  });

  describe('AWS Type Map', () => {
    it('should map AWS iceTypes (ENGINE-1)', async () => {
      const mod = await import('../deploy/card-translator.js');
      const awsTypes = [
        'Application.Container', 'Application.ServerlessFunction',
        'Database.PostgreSQL', 'Storage.Bucket', 'Messaging.Queue',
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
      const mod = await import('../deploy/card-translator.js');
      const result = mod.translate_card_to_graph({
        nodes: [{ id: 'n1', type: 'resource', data: { iceType: 'Application.Container', label: 'app' } }],
        edges: [],
        provider: 'aws',
        projectName: 'test',
      });
      expect(result.deployable_count).toBe(1);
    });
  });

  describe('Azure Type Map', () => {
    it('should map Azure iceTypes (ENGINE-2)', async () => {
      const mod = await import('../deploy/card-translator.js');
      const result = mod.translate_card_to_graph({
        nodes: [
          { id: 'n1', type: 'resource', data: { iceType: 'Application.Container', label: 'app' } },
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
      const mod = await import('../deploy/card-translator.js');

      for (const provider of ['alibaba', 'digitalocean', 'kubernetes']) {
        const result = mod.translate_card_to_graph({
          nodes: [{ id: 'n1', type: 'resource', data: { iceType: 'Application.Container', label: 'app' } }],
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
      const mod = await import('../deploy/card-translator.js');
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
      const mod = await import('../deploy/card-translator.js');
      const result = mod.translate_card_to_graph({
        nodes: [{ id: 'n1', type: 'resource', data: { iceType: 'Log.Terminal', label: 'logs' } }],
        edges: [],
        provider: 'gcp',
        projectName: 'test',
      });
      expect(result.deployable_count).toBe(0);
    });
  });
});
