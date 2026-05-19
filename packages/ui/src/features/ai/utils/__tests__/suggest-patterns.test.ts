/**
 * suggestPatterns — analyzes the canvas and returns up to 3 contextual
 * infrastructure suggestions. Every condition is a string-set membership
 * test; tests drive each branch by feeding handcrafted node arrays.
 */

import { describe, it, expect } from 'vitest';
import { suggestPatterns } from '../suggest-patterns';

const nodeWith = (data: Record<string, unknown>) => ({
  id: `n-${Math.random()}`,
  type: 'block',
  data,
});

describe('suggestPatterns — empty canvas', () => {
  it('returns three starter suggestions when the canvas has no nodes', () => {
    const out = suggestPatterns([], []);
    expect(out).toHaveLength(3);
    expect(out[0].label).toContain('web app');
    expect(out[1].label).toContain('microservices');
    expect(out[2].label).toContain('serverless');
  });
});

describe('suggestPatterns — backend + database suggestions', () => {
  it('suggests a Redis cache when backend + db exist but no cache', () => {
    const nodes = [
      nodeWith({ iceType: 'Compute.Function' }),
      nodeWith({ iceType: 'Database.PostgreSQL' }),
    ];
    const out = suggestPatterns(nodes, []);
    const labels = out.map((s) => s.label);
    expect(labels).toContain('Add a Redis cache for performance');
  });

  it('does not suggest a cache when one already exists (Redis)', () => {
    const nodes = [
      nodeWith({ iceType: 'Compute.Function' }),
      nodeWith({ iceType: 'Database.PostgreSQL' }),
      nodeWith({ iceType: 'Cache.Redis' }),
    ];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).not.toContain('Add a Redis cache for performance');
  });

  it('suggests monitoring when backend exists but no monitoring node is present', () => {
    const nodes = [nodeWith({ iceType: 'Compute.Function' })];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).toContain('Add monitoring and logging');
  });

  it('does not suggest monitoring when a Log node already exists', () => {
    const nodes = [
      nodeWith({ iceType: 'Compute.Function' }),
      nodeWith({ iceType: 'Monitoring.Log' }),
    ];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).not.toContain('Add monitoring and logging');
  });

  it('suggests authentication when backend exists but no Auth/IAM node', () => {
    const nodes = [nodeWith({ iceType: 'Compute.Container' })];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).toContain('Add authentication');
  });
});

describe('suggestPatterns — gateway / queue / secrets / repo / VPC', () => {
  it('suggests an API gateway when backend exists, no gateway, and >2 nodes total', () => {
    const nodes = [
      nodeWith({ iceType: 'Compute.Container' }),
      nodeWith({ iceType: 'Database.PostgreSQL' }),
      nodeWith({ iceType: 'Cache.Redis' }),
      nodeWith({ iceType: 'IAM.Role' }),
    ];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).toContain('Add an API gateway');
  });

  it('does not suggest a gateway when one already exists', () => {
    const nodes = [
      nodeWith({ iceType: 'Compute.Container' }),
      nodeWith({ iceType: 'Network.LoadBalancer' }),
      nodeWith({ iceType: 'Database.PostgreSQL' }),
    ];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).not.toContain('Add an API gateway');
  });

  it('suggests a message queue when backend + db exist, no queue, and >=3 nodes', () => {
    // Suppress earlier-priority suggestions (cache, monitoring, auth, gateway)
    // so the queue suggestion lands in the top-3 slice.
    const nodes = [
      nodeWith({ iceType: 'Compute.Container' }),
      nodeWith({ iceType: 'Database.PostgreSQL' }),
      nodeWith({ iceType: 'Cache.Redis' }),
      nodeWith({ iceType: 'Monitoring.Log' }),
      nodeWith({ iceType: 'IAM.Role' }),
      nodeWith({ iceType: 'Network.LoadBalancer' }),
    ];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).toContain('Add a message queue for async tasks');
  });

  it('suggests secrets management when backend + db exist and no secrets node', () => {
    // Suppress cache + monitoring + auth + gateway + queue so secrets surfaces.
    const nodes = [
      nodeWith({ iceType: 'Compute.Function' }),
      nodeWith({ iceType: 'Database.PostgreSQL' }),
      nodeWith({ iceType: 'Cache.Redis' }),
      nodeWith({ iceType: 'Monitoring.Log' }),
      nodeWith({ iceType: 'IAM.Role' }),
      nodeWith({ iceType: 'Network.LoadBalancer' }),
      nodeWith({ iceType: 'Kafka.Cluster' }),
    ];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).toContain('Add secrets management');
  });

  it('does not suggest secrets when a Vault/Secret node exists', () => {
    const nodes = [
      nodeWith({ iceType: 'Compute.Function' }),
      nodeWith({ iceType: 'Database.PostgreSQL' }),
      nodeWith({ iceType: 'Vault.HashiCorp' }),
    ];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).not.toContain('Add secrets management');
  });

  it('suggests connecting a repo when backend exists but no repo node', () => {
    const nodes = [nodeWith({ iceType: 'Compute.Container' })];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).toContain('Connect a GitHub repository for CI/CD');
  });

  it('treats Source.Repository as a repo and suppresses the repo suggestion', () => {
    const nodes = [
      nodeWith({ iceType: 'Compute.Container' }),
      nodeWith({ iceType: 'Source.Repository' }),
    ];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).not.toContain('Connect a GitHub repository for CI/CD');
  });

  it('suggests VPC when there are 4+ nodes and no VPC', () => {
    const nodes = [
      nodeWith({ iceType: 'Compute.Container' }),
      nodeWith({ iceType: 'Database.PostgreSQL' }),
      nodeWith({ iceType: 'Cache.Redis' }),
      nodeWith({ iceType: 'IAM.Role' }),
    ];
    // Order of suggestions matters: the first 3 returned. To ensure VPC
    // suggestion appears, need a setup where it's among the first 3.
    const out = suggestPatterns(nodes, []);
    // Assemble all labels in order
    const labels = out.map((s) => s.label);
    // VPC suggestion may be in the top 3; assert at least one VPC mention if so
    // (the slice keeps first 3, and several earlier conditions also fire here).
    // Use a more focused fixture for the specific assertion.
    const focusedNodes = [
      nodeWith({ iceType: 'Compute.Container' }),
      nodeWith({ iceType: 'Network.LoadBalancer' }),
      nodeWith({ iceType: 'Monitoring.Log' }),
      nodeWith({ iceType: 'IAM.Role' }),
      nodeWith({ iceType: 'Vault.HashiCorp' }),
      nodeWith({ iceType: 'Source.Repository' }),
      nodeWith({ iceType: 'Cache.Redis' }),
    ];
    const focusedLabels = suggestPatterns(focusedNodes, []).map((s) => s.label);
    expect(focusedLabels).toContain('Add VPC and network security');
  });

  it('does not suggest a VPC when one is already present', () => {
    const nodes = [
      nodeWith({ iceType: 'Compute.Container' }),
      nodeWith({ iceType: 'Network.VPC' }),
      nodeWith({ iceType: 'Database.PostgreSQL' }),
      nodeWith({ iceType: 'IAM.Role' }),
      nodeWith({ iceType: 'Monitoring.Log' }),
    ];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).not.toContain('Add VPC and network security');
  });

  it('suggests a backend when database exists but no compute', () => {
    const nodes = [nodeWith({ iceType: 'Database.PostgreSQL' })];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).toContain('Add a backend service');
  });
});

describe('suggestPatterns — db-shape predicates', () => {
  it('treats MongoDB as a database', () => {
    const nodes = [
      nodeWith({ iceType: 'Compute.Function' }),
      nodeWith({ iceType: 'Database.MongoDB' }),
    ];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).toContain('Add a Redis cache for performance');
  });

  it('treats data warehouses as databases', () => {
    const nodes = [
      nodeWith({ iceType: 'Compute.Function' }),
      nodeWith({ iceType: 'Analytics.Warehouse' }),
    ];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).toContain('Add a Redis cache for performance');
  });

  it('treats MySQL as a database', () => {
    const nodes = [
      nodeWith({ iceType: 'Compute.Function' }),
      nodeWith({ iceType: 'Database.MySQL' }),
    ];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).toContain('Add a Redis cache for performance');
  });
});

describe('suggestPatterns — backend-shape predicates', () => {
  it('treats nodes with Worker iceType as backends', () => {
    const nodes = [nodeWith({ iceType: 'Compute.Worker' })];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    // Triggers monitoring + auth + repo suggestions
    expect(labels).toContain('Add monitoring and logging');
  });

  it('treats nodes with the scalable behavior as backends', () => {
    const nodes = [nodeWith({ iceType: 'Custom.Service', behavior: 'scalable' })];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).toContain('Add monitoring and logging');
  });

  it('treats nodes with the source behavior as repos', () => {
    const nodes = [
      nodeWith({ iceType: 'Compute.Function' }),
      nodeWith({ iceType: 'Custom.Source', behavior: 'source' }),
    ];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).not.toContain('Connect a GitHub repository for CI/CD');
  });
});

describe('suggestPatterns — auth / cache / queue / vpc predicate variants', () => {
  it('treats IAM.* as auth', () => {
    const nodes = [
      nodeWith({ iceType: 'Compute.Function' }),
      nodeWith({ iceType: 'IAM.Role' }),
    ];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).not.toContain('Add authentication');
  });

  it('treats Memcache as a cache', () => {
    const nodes = [
      nodeWith({ iceType: 'Compute.Function' }),
      nodeWith({ iceType: 'Database.PostgreSQL' }),
      nodeWith({ iceType: 'Cache.Memcache' }),
    ];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).not.toContain('Add a Redis cache for performance');
  });

  it('treats RabbitMQ as a queue', () => {
    const nodes = [
      nodeWith({ iceType: 'Compute.Function' }),
      nodeWith({ iceType: 'Database.PostgreSQL' }),
      nodeWith({ iceType: 'RabbitMQ.Cluster' }),
    ];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).not.toContain('Add a message queue for async tasks');
  });

  it('treats Kafka as a queue', () => {
    const nodes = [
      nodeWith({ iceType: 'Compute.Function' }),
      nodeWith({ iceType: 'Database.PostgreSQL' }),
      nodeWith({ iceType: 'Kafka.Cluster' }),
    ];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).not.toContain('Add a message queue for async tasks');
  });

  it('treats Event nodes as queues', () => {
    const nodes = [
      nodeWith({ iceType: 'Compute.Function' }),
      nodeWith({ iceType: 'Database.PostgreSQL' }),
      nodeWith({ iceType: 'Event.Bus' }),
    ];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).not.toContain('Add a message queue for async tasks');
  });

  it('treats Observability nodes as monitoring', () => {
    const nodes = [
      nodeWith({ iceType: 'Compute.Function' }),
      nodeWith({ iceType: 'Observability.Tracing' }),
    ];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).not.toContain('Add monitoring and logging');
  });

  it('treats nodes with Repository in iceType (not exactly Source.Repository) as repos', () => {
    const nodes = [
      nodeWith({ iceType: 'Compute.Function' }),
      nodeWith({ iceType: 'Custom.Repository' }),
    ];
    const labels = suggestPatterns(nodes, []).map((s) => s.label);
    expect(labels).not.toContain('Connect a GitHub repository for CI/CD');
  });
});

describe('suggestPatterns — top-3 truncation', () => {
  it('returns at most 3 suggestions even when many fire', () => {
    // Fire backend + db + queue + secrets + repo + VPC predicates simultaneously.
    const nodes = [
      nodeWith({ iceType: 'Compute.Container' }),
      nodeWith({ iceType: 'Database.PostgreSQL' }),
      nodeWith({ iceType: 'Compute.Function' }),
      nodeWith({ iceType: 'Compute.Worker' }),
      nodeWith({ iceType: 'Compute.Backend' }),
    ];
    const out = suggestPatterns(nodes, []);
    expect(out.length).toBeLessThanOrEqual(3);
  });
});

describe('suggestPatterns — defensive coalescing', () => {
  it('treats nodes with missing data as having no iceType / behavior', () => {
    const nodes = [
      { id: 'n1', type: 'block' } as any,
      nodeWith({}),
    ];
    // No backend, no db, no anything. Returns no suggestions because the
    // empty-canvas branch only fires for length-0 arrays.
    const out = suggestPatterns(nodes, []);
    expect(out).toEqual([]);
  });
});
