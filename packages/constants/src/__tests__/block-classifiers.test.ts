/**
 * Tests for `block-classifiers` — the shared role table that drives
 * block-type classification across `@ice/types` connection-rules AND
 * `@ice/core` propagation-rules.
 *
 * Cardinal rule check: the table is the single declarative fact for
 * "what role does this iceType play?". Both packages read from it via
 * `hasBlockRole(t, role)`; no iceType strings appear in classifier
 * code on either side.
 *
 * These tests pin the role semantics so any future drift between the
 * canonical iceTypes (Compute.X, Database.X, Storage.X) and the
 * provider-specific iceTypes (raw blueprint iceTypes under varied
 * namespaces) is caught.
 */

import { describe, it, expect } from 'vitest';
import { hasBlockRole, BLOCK_ROLES_BY_ICE_TYPE, BLOCK_ROLES_BY_PREFIX } from '../block-classifiers';

describe('hasBlockRole — exact iceType matches', () => {
  it('Source.Repository → repo', () => {
    expect(hasBlockRole('Source.Repository', 'repo')).toBe(true);
    expect(hasBlockRole('Source.Repository', 'backend')).toBe(false);
  });

  it('Config.Environment → envConfig', () => {
    expect(hasBlockRole('Config.Environment', 'envConfig')).toBe(true);
  });

  it('Security.Secret → secrets', () => {
    expect(hasBlockRole('Security.Secret', 'secrets')).toBe(true);
  });

  it('Network.CustomDomain → customDomain + domain', () => {
    expect(hasBlockRole('Network.CustomDomain', 'customDomain')).toBe(true);
    expect(hasBlockRole('Network.CustomDomain', 'domain')).toBe(true);
  });

  it('Network.PrivateNetwork → privateNetwork', () => {
    expect(hasBlockRole('Network.PrivateNetwork', 'privateNetwork')).toBe(true);
  });

  it('Util.Reroute → reroute', () => {
    expect(hasBlockRole('Util.Reroute', 'reroute')).toBe(true);
  });
});

describe('hasBlockRole — category-prefix inheritance', () => {
  it('any Compute.* → backend', () => {
    expect(hasBlockRole('Compute.Container', 'backend')).toBe(true);
    expect(hasBlockRole('Compute.NewMadeUpType', 'backend')).toBe(true);
  });

  it('any Database.* → database', () => {
    expect(hasBlockRole('Database.PostgreSQL', 'database')).toBe(true);
    expect(hasBlockRole('Database.NewMadeUpType', 'database')).toBe(true);
  });

  it('any Storage.* → storage', () => {
    expect(hasBlockRole('Storage.Bucket', 'storage')).toBe(true);
  });

  it('any Messaging.* → queue', () => {
    expect(hasBlockRole('Messaging.Queue', 'queue')).toBe(true);
    expect(hasBlockRole('Messaging.EventStream', 'queue')).toBe(true);
  });

  it('any Monitoring.* or Log.* → monitoring', () => {
    expect(hasBlockRole('Monitoring.Log', 'monitoring')).toBe(true);
    expect(hasBlockRole('Log.Sink', 'monitoring')).toBe(true);
  });
});

describe('hasBlockRole — regex matches for provider-specific iceTypes', () => {
  it('iceTypes containing PostgreSQL / MySQL / MongoDB → database', () => {
    expect(hasBlockRole('aws.rds.PostgreSQL', 'database')).toBe(true);
    expect(hasBlockRole('gcp.sql.MySQL', 'database')).toBe(true);
  });

  it('iceTypes containing Redis / Cache → cache', () => {
    expect(hasBlockRole('Cache.Redis', 'cache')).toBe(true);
    expect(hasBlockRole('aws.elasticache.Cache', 'cache')).toBe(true);
  });

  it('iceTypes containing Bucket / S3 / GCS → storage', () => {
    expect(hasBlockRole('aws.s3.Bucket', 'storage')).toBe(true);
  });

  it('iceTypes containing Container / Function / Worker → backend', () => {
    expect(hasBlockRole('aws.ecs.Container', 'backend')).toBe(true);
    expect(hasBlockRole('gcp.cloudfunctions.Function', 'backend')).toBe(true);
  });
});

describe('hasBlockRole — composite domain role', () => {
  it('PublicEndpoint → domain (composite, not just customDomain)', () => {
    expect(hasBlockRole('Network.PublicEndpoint', 'domain')).toBe(true);
    expect(hasBlockRole('Network.PublicEndpoint', 'customDomain')).toBe(false);
  });

  it('CustomDomain → domain AND customDomain', () => {
    expect(hasBlockRole('Network.CustomDomain', 'domain')).toBe(true);
    expect(hasBlockRole('Network.CustomDomain', 'customDomain')).toBe(true);
  });
});

describe('hasBlockRole — negative cases', () => {
  it('returns false for unknown iceTypes', () => {
    expect(hasBlockRole('Totally.Made.Up', 'database')).toBe(false);
    expect(hasBlockRole('', 'backend')).toBe(false);
  });

  it('returns false for the wrong role', () => {
    expect(hasBlockRole('Source.Repository', 'database')).toBe(false);
  });
});

describe('table integrity', () => {
  it('every exact-match entry uses at least one role', () => {
    for (const [iceType, roles] of Object.entries(BLOCK_ROLES_BY_ICE_TYPE)) {
      expect(roles.length, `${iceType} has no roles`).toBeGreaterThan(0);
    }
  });

  it('every prefix entry ends with a dot (category separator)', () => {
    for (const entry of BLOCK_ROLES_BY_PREFIX) {
      expect(entry.prefix.endsWith('.'), `prefix ${entry.prefix} should end with .`).toBe(true);
    }
  });
});
