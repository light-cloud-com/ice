/**
 * Smoke tests for the per-category data extractions (rf-hlres-2..7).
 *
 * Each category file exports a single `HighLevelCategory` literal that was
 * cut byte-identical out of `../high-level-resources.ts`. These tests pin:
 *   - the export resolves and has the expected shape
 *   - the entry count
 *   - that the resource ids match the canonical list (catches accidental
 *     drop / duplicate during the splice)
 *
 * As later units land, the assertions for newer categories are appended.
 * The shim's `HIGH_LEVEL_CATEGORIES` ordering is exercised in
 * `./high-level-resources-types.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { compute } from '../high-level-resources/categories/compute';
import { database } from '../high-level-resources/categories/database';
import { messaging } from '../high-level-resources/categories/messaging';
import { monitoring } from '../high-level-resources/categories/monitoring';
import { networking } from '../high-level-resources/categories/networking';
import { security } from '../high-level-resources/categories/security';
import { storage } from '../high-level-resources/categories/storage';

describe('compute category (rf-hlres-2)', () => {
  it('has the expected metadata', () => {
    expect(compute.id).toBe('compute');
    expect(compute.name).toBe('Compute');
    expect(compute.description).toBe('Web apps, APIs, and services');
    expect(compute.icon).toBe('Globe');
  });

  it('contains the canonical resource ids in order', () => {
    const ids = compute.resources.map((r) => r.id);
    // Pulled from the original inline array — these are the canonical compute resources.
    expect(ids).toEqual([
      'frontend-app',
      'backend-api',
      'serverless-function',
      'function-compute',
      'oci-functions',
      'do-app-platform',
      'container-service',
      'worker',
      'ssr-site',
      'scheduled-task',
      'llm-gateway',
      'ml-model',
      'private-ai-service',
    ]);
  });

  it('frontend-app has at least one provider implementation', () => {
    const fe = compute.resources.find((r) => r.id === 'frontend-app');
    expect(fe).toBeDefined();
    expect(fe!.providers.length).toBeGreaterThan(0);
    expect(fe!.implementations.length).toBeGreaterThan(0);
  });

  it('backend-api carries the expected behavior + properties shape', () => {
    const be = compute.resources.find((r) => r.id === 'backend-api');
    expect(be).toBeDefined();
    expect(typeof be!.behavior).toBe('string');
    expect(Array.isArray(be!.properties)).toBe(true);
    expect(be!.properties.length).toBeGreaterThan(0);
  });
});

describe('database category (rf-hlres-3)', () => {
  it('has the expected metadata', () => {
    expect(database.id).toBe('database');
    expect(database.name).toBe('Database');
    expect(database.description).toBe('Relational, NoSQL, and cache databases');
    expect(database.icon).toBe('Database');
  });

  it('contains the canonical resource ids in order', () => {
    const ids = database.resources.map((r) => r.id);
    expect(ids).toEqual([
      'postgres-db',
      'mysql-db',
      'mongodb',
      'redis-cache',
      'dynamodb',
      'firestore',
      'cosmosdb',
      'tablestore',
      'autonomous-db',
      'do-managed-db',
      'vector-db',
      'data-warehouse',
      'search-engine',
    ]);
  });

  it('postgres-db has multi-provider implementations', () => {
    const pg = database.resources.find((r) => r.id === 'postgres-db');
    expect(pg).toBeDefined();
    expect(pg!.providers.length).toBeGreaterThan(1);
  });

  it('redis-cache has property catalogue', () => {
    const redis = database.resources.find((r) => r.id === 'redis-cache');
    expect(redis).toBeDefined();
    expect(redis!.properties.length).toBeGreaterThan(0);
  });
});

describe('storage category (rf-hlres-4)', () => {
  it('has the expected metadata', () => {
    expect(storage.id).toBe('storage');
    expect(storage.name).toBe('Storage');
  });

  it('contains the canonical resource ids in order', () => {
    const ids = storage.resources.map((r) => r.id);
    expect(ids).toEqual(['object-storage', 'oss', 'oci-object-storage', 'do-spaces', 'file-storage']);
  });

  it('object-storage has multi-provider implementations', () => {
    const obj = storage.resources.find((r) => r.id === 'object-storage');
    expect(obj).toBeDefined();
    expect(obj!.implementations.length).toBeGreaterThan(0);
  });
});

describe('networking category (rf-hlres-5)', () => {
  it('has the expected metadata', () => {
    expect(networking.id).toBe('networking');
    expect(networking.name).toBe('Networking');
  });

  it('contains the canonical resource ids in order', () => {
    const ids = networking.resources.map((r) => r.id);
    expect(ids).toEqual(['public-endpoint', 'vpc-network', 'subnet', 'load-balancer', 'cdn', 'api-gateway', 'dns-zone']);
  });

  it('public-endpoint exposes property catalogue', () => {
    const pe = networking.resources.find((r) => r.id === 'public-endpoint');
    expect(pe).toBeDefined();
    expect(pe!.properties.length).toBeGreaterThan(0);
  });
});

describe('messaging category (rf-hlres-6)', () => {
  it('has the expected metadata', () => {
    expect(messaging.id).toBe('messaging');
    expect(messaging.name).toBe('Messaging');
  });

  it('contains the canonical resource ids in order', () => {
    const ids = messaging.resources.map((r) => r.id);
    expect(ids).toEqual([
      'message-queue',
      'event-bus',
      'rabbitmq',
      'cloud-pubsub',
      'service-bus',
      'email-service',
      'event-stream',
    ]);
  });

  it('message-queue carries deep optionDetails arrays', () => {
    const mq = messaging.resources.find((r) => r.id === 'message-queue');
    expect(mq).toBeDefined();
    const queueType = mq!.properties.find((p) => p.name === 'queue_type');
    expect(queueType).toBeDefined();
    expect(Array.isArray(queueType!.optionDetails)).toBe(true);
    expect((queueType!.optionDetails ?? []).length).toBeGreaterThan(0);
  });
});

describe('security category (rf-hlres-7)', () => {
  it('has the expected metadata', () => {
    expect(security.id).toBe('security');
    expect(security.name).toBe('Security');
  });

  it('contains the canonical resource ids in order', () => {
    const ids = security.resources.map((r) => r.id);
    expect(ids).toEqual(['secret-store', 'ssl-certificate', 'service-account', 'auth']);
  });

  it('secret-store covers AWS, GCP, Azure, and K8s', () => {
    const ss = security.resources.find((r) => r.id === 'secret-store');
    expect(ss).toBeDefined();
    expect(ss!.providers).toEqual(['aws', 'gcp', 'azure', 'kubernetes']);
  });
});

describe('monitoring category (rf-hlres-7)', () => {
  it('has the expected metadata', () => {
    expect(monitoring.id).toBe('monitoring');
    expect(monitoring.name).toBe('Monitoring');
  });

  it('contains the canonical resource ids in order', () => {
    const ids = monitoring.resources.map((r) => r.id);
    expect(ids).toEqual(['log-group', 'alert', 'dashboard']);
  });

  it('alert exposes property catalogue', () => {
    const al = monitoring.resources.find((r) => r.id === 'alert');
    expect(al).toBeDefined();
    expect(al!.properties.length).toBeGreaterThan(0);
  });
});
