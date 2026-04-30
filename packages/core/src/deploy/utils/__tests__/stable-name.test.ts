/**
 * Tests for `utils/stable-name.ts` — deterministic resource-name generation.
 *
 * Covers RISK #1 from the rf-ctrans blueprint: the seed string format
 * `${project_name}::${environment}::${node_id}` is the identity anchor for
 * every deployed resource. The seed-pin test computes the expected hash
 * suffix inline via `createHash` so any future change to the seed format
 * (different delimiter, different field order, normalized environment)
 * fails the test loudly rather than silently triggering destroy-recreate
 * on every existing deployment.
 *
 * Other surface: ENV_SHORT lookups, slug fallbacks ('p', 'env', 'res',
 * 'resource'), 40-char Memorystore length cap, determinism, and the
 * three independent isolation axes (node_id, project_name, environment).
 */

import { createHash } from 'crypto';
import { describe, it, expect } from 'vitest';
import { ENV_SHORT, generate_stable_name } from '../stable-name.js';

const MEMORYSTORE_MAX = 40;

describe('ENV_SHORT', () => {
  it('maps production → prod', () => {
    expect(ENV_SHORT['production']).toBe('prod');
  });

  it('maps staging → stage', () => {
    expect(ENV_SHORT['staging']).toBe('stage');
  });

  it('maps development → dev', () => {
    expect(ENV_SHORT['development']).toBe('dev');
  });

  it('exposes exactly the three known environments', () => {
    expect(Object.keys(ENV_SHORT).sort()).toEqual(['development', 'production', 'staging']);
  });
});

describe('generate_stable_name', () => {
  describe('RISK #1 — seed format', () => {
    it('hashes the seed `${project_name}::${environment}::${node_id}` verbatim', () => {
      // RISK #1 pin: any change to the seed format (different delimiter,
      // different field order, normalized environment) produces a different
      // hash and triggers destroy-recreate on every existing deployment.
      // We compute the expected hash here directly so the test will fail
      // loudly if a future refactor "modernizes" the delimiters.
      const project_name = 'myproject';
      const environment = 'production';
      const node_id = 'node-abc';
      const seed = `${project_name}::${environment}::${node_id}`;
      const expected_hash = createHash('sha256').update(seed).digest('hex').slice(0, 8);

      const name = generate_stable_name('Compute.CloudRun', node_id, project_name, environment);

      expect(name.endsWith(`-${expected_hash}`)).toBe(true);
    });

    it('produces the expected full name for a canonical input', () => {
      const project_name = 'myproject';
      const environment = 'production';
      const node_id = 'node-abc';
      const seed = `${project_name}::${environment}::${node_id}`;
      const expected_hash = createHash('sha256').update(seed).digest('hex').slice(0, 8);

      const name = generate_stable_name('Compute.CloudRun', node_id, project_name, environment);

      // ice-{projectSlug:8}-{envSlug}-{typeSlug:10}-{hash:8}
      // myproject → myprojec (8-char cap), production → prod (ENV_SHORT),
      // CloudRun → cloudrun (lowercased, 10-char cap)
      expect(name).toBe(`ice-myprojec-prod-cloudrun-${expected_hash}`);
    });
  });

  describe('result format', () => {
    it('starts with `ice-` and ends with the 8-char hex hash', () => {
      const name = generate_stable_name('Compute.CloudRun', 'node-1', 'p', 'production');
      expect(name.startsWith('ice-')).toBe(true);
      expect(/-[0-9a-f]{8}$/.test(name)).toBe(true);
    });

    it('takes typeSlug from the part after the last dot', () => {
      const name = generate_stable_name('Compute.CloudRun', 'node-1', 'proj', 'production');
      // typeSlug should be `cloudrun`, not `compute`
      expect(name).toMatch(/-cloudrun-[0-9a-f]{8}$/);
    });

    it('uses the bare type when there is no dot in resource_type', () => {
      const name = generate_stable_name('Bucket', 'node-1', 'proj', 'production');
      expect(name).toMatch(/-bucket-[0-9a-f]{8}$/);
    });
  });

  describe('typeSlug fallback `resource`', () => {
    it('falls back to `resource` (then sanitized to 10-char `resource`) for empty resource_type', () => {
      const name = generate_stable_name('', 'node-1', 'proj', 'production');
      // split('').pop() on '' returns '' (falsy) → fallback to 'resource'
      // sanitize_name('resource').slice(0, 10) → 'resource' (8 chars, no truncation needed)
      expect(name).toMatch(/-resource-[0-9a-f]{8}$/);
    });
  });

  describe('typeSlug `res` fallback', () => {
    it('falls back to `res` when type sanitizes to a dash-only string', () => {
      // resource_type after split.pop is `---` → sanitize_name strips dashes → ''
      // first slice(0,10) on '' is '', replace(/-+$/,'') → '', `|| 'res'` fires
      const name = generate_stable_name('---', 'node-1', 'proj', 'production');
      expect(name).toMatch(/-res-[0-9a-f]{8}$/);
    });
  });

  describe('projectSlug fallback `p`', () => {
    it('falls back to `p` for empty project_name', () => {
      const name = generate_stable_name('Compute.CloudRun', 'node-1', '', 'production');
      // sanitize_name('') → '' → '|| p'
      expect(name).toMatch(/^ice-p-prod-cloudrun-[0-9a-f]{8}$/);
    });

    it('falls back to `p` when project_name sanitizes to dashes only', () => {
      const name = generate_stable_name('Compute.CloudRun', 'node-1', '---', 'production');
      // sanitize_name('---') → '' (leading/trailing dashes stripped) → '|| p'
      expect(name).toMatch(/^ice-p-prod-cloudrun-[0-9a-f]{8}$/);
    });

    it('strips trailing dashes from a truncated project slug', () => {
      // 'my-very-long-project-name' → sanitize → 'my-very-long-project-name'
      // slice(0, 8) → 'my-very-' → replace(/-+$/, '') → 'my-very'
      const name = generate_stable_name('Compute.CloudRun', 'node-1', 'my-very-long-project-name', 'production');
      expect(name).toMatch(/^ice-my-very-prod-cloudrun-[0-9a-f]{8}$/);
    });
  });

  describe('envSlug', () => {
    it('uses ENV_SHORT for the three known environments', () => {
      const prod = generate_stable_name('Compute.CloudRun', 'node-1', 'proj', 'production');
      const stage = generate_stable_name('Compute.CloudRun', 'node-1', 'proj', 'staging');
      const dev = generate_stable_name('Compute.CloudRun', 'node-1', 'proj', 'development');
      expect(prod).toMatch(/-prod-/);
      expect(stage).toMatch(/-stage-/);
      expect(dev).toMatch(/-dev-/);
    });

    it('falls back to a 4-char sanitized slice for unknown environments', () => {
      // 'preview' → not in ENV_SHORT → sanitize_name('preview').slice(0,4) → 'prev'
      const name = generate_stable_name('Compute.CloudRun', 'node-1', 'proj', 'preview');
      expect(name).toMatch(/-prev-/);
    });

    it('falls back to `env` for empty environment', () => {
      // '' is not in ENV_SHORT, sanitize_name('').slice(0,4) → '', → '|| env'
      const name = generate_stable_name('Compute.CloudRun', 'node-1', 'proj', '');
      expect(name).toMatch(/-env-/);
    });

    it('falls back to `env` when environment sanitizes to dashes only', () => {
      // '---' → not in ENV_SHORT (different key) → sanitize_name('---') → '' → '|| env'
      const name = generate_stable_name('Compute.CloudRun', 'node-1', 'proj', '---');
      expect(name).toMatch(/-env-/);
    });

    it('strips trailing dashes from the env slug', () => {
      // 'qa-' → sanitize_name('qa-').slice(0,4) → 'qa' (sanitize already stripped '-')
      // 'a-b-c-d-e' → not in ENV_SHORT → sanitize → 'a-b-c-d-e' → slice(0,4) → 'a-b-' → replace → 'a-b'
      const name = generate_stable_name('Compute.CloudRun', 'node-1', 'proj', 'a-b-c-d-e');
      expect(name).toMatch(/-a-b-/);
    });
  });

  describe('typeSlug truncation', () => {
    it('caps the typeSlug at 10 chars', () => {
      // 'Compute.AVeryLongTypeName' → pop → 'AVeryLongTypeName' → sanitize → 'averylongtypename'
      // slice(0,10) → 'averylongt'
      const name = generate_stable_name('Compute.AVeryLongTypeName', 'node-1', 'proj', 'production');
      expect(name).toMatch(/-averylongt-[0-9a-f]{8}$/);
    });

    it('strips trailing dashes from a truncated type slug', () => {
      // 'a-b-c-d-e-f-g' → sanitize → 'a-b-c-d-e-f-g' → slice(0,10) → 'a-b-c-d-e-' → replace → 'a-b-c-d-e'
      const name = generate_stable_name(`prefix.a-b-c-d-e-f-g`, 'node-1', 'proj', 'production');
      expect(name).toMatch(/-a-b-c-d-e-[0-9a-f]{8}$/);
    });
  });

  describe('length cap (Memorystore 40-char limit)', () => {
    it('stays at or under 40 chars for canonical inputs', () => {
      const name = generate_stable_name('Compute.CloudRun', 'node-abc', 'myproject', 'production');
      expect(name.length).toBeLessThanOrEqual(MEMORYSTORE_MAX);
    });

    it('stays at or under 40 chars for the longest plausible input', () => {
      // Worst-case lengths everywhere: long project, unknown long env, long type, long node id.
      const name = generate_stable_name(
        'Compute.AVeryLongResourceTypeName',
        'long-canvas-node-uuid-abc-def-1234567890',
        'a-very-long-project-name-that-exceeds-the-limit',
        'a-truly-unusual-environment-name',
      );
      expect(name.length).toBeLessThanOrEqual(MEMORYSTORE_MAX);
    });

    it('stays at or under 40 chars for short fallback inputs', () => {
      const name = generate_stable_name('', '', '', '');
      expect(name.length).toBeLessThanOrEqual(MEMORYSTORE_MAX);
    });
  });

  describe('determinism', () => {
    it('produces the same name for the same inputs across calls', () => {
      const a = generate_stable_name('Compute.CloudRun', 'node-1', 'proj', 'production');
      const b = generate_stable_name('Compute.CloudRun', 'node-1', 'proj', 'production');
      expect(a).toBe(b);
    });
  });

  describe('isolation', () => {
    it('produces a different hash for different node_id', () => {
      const a = generate_stable_name('Compute.CloudRun', 'node-1', 'proj', 'production');
      const b = generate_stable_name('Compute.CloudRun', 'node-2', 'proj', 'production');
      // The slugs are identical, so only the trailing hash differs.
      expect(a).not.toBe(b);
      const hashA = a.slice(-8);
      const hashB = b.slice(-8);
      expect(hashA).not.toBe(hashB);
    });

    it('produces a different hash for different project_name (cross-project isolation)', () => {
      const a = generate_stable_name('Compute.CloudRun', 'node-1', 'project-a', 'production');
      const b = generate_stable_name('Compute.CloudRun', 'node-1', 'project-b', 'production');
      const hashA = a.slice(-8);
      const hashB = b.slice(-8);
      expect(hashA).not.toBe(hashB);
    });

    it('produces a different hash for different environment (cross-env isolation)', () => {
      const a = generate_stable_name('Compute.CloudRun', 'node-1', 'proj', 'production');
      const b = generate_stable_name('Compute.CloudRun', 'node-1', 'proj', 'staging');
      const hashA = a.slice(-8);
      const hashB = b.slice(-8);
      expect(hashA).not.toBe(hashB);
    });
  });
});
