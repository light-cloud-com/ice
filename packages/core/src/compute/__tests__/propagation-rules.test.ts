/**
 * Tests for `compute/propagation-rules.ts`.
 *
 * Behaviour pinned:
 *  - Each propagation rule's classifier predicates (source/target) match the
 *    iceTypes they should and reject everything else.
 *  - Each rule's `compute` returns the expected derived patch given typical
 *    inputs, and returns null when its prerequisites are missing.
 *  - Each aggregate rule classifies and aggregates correctly, filtering by
 *    `connectionCategory: 'traffic'`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROPAGATION_RULES, AGGREGATE_RULES } from '../propagation-rules';
import type { PropagationContext, PropagationEdge, PropagationNode, PropagationRule, AggregateRule } from '../types';

// ─── Helpers ───────────────────────────────────────────────────────────────

function findRule(label: string): PropagationRule {
  const rule = PROPAGATION_RULES.find((r) => r.label === label);
  if (!rule) throw new Error(`Missing rule: ${label}`);
  return rule;
}

function findAggregate(label: string): AggregateRule {
  const rule = AGGREGATE_RULES.find((r) => r.label === label);
  if (!rule) throw new Error(`Missing aggregate rule: ${label}`);
  return rule;
}

function makeNode(id: string, iceType: string, extra: Record<string, unknown> = {}): PropagationNode {
  return { id, type: 'block', data: { iceType, ...extra } };
}

function makeEdge(id: string, source: string, target: string, data: PropagationEdge['data'] = {}): PropagationEdge {
  return { id, source, target, data };
}

const EMPTY_CTX: PropagationContext = { allNodes: [], allEdges: [] };

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Rule registry surface ─────────────────────────────────────────────────

describe('PROPAGATION_RULES registry', () => {
  it('exposes the seven labelled rules', () => {
    expect(PROPAGATION_RULES.map((r) => r.label)).toEqual([
      'CustomDomain → Service: domain propagation',
      'Repository → Service: source code propagation',
      'Service → Secret: inject secret references',
      'Service → EnvConfig: inject environment variables',
      'Backend → DataStore: connection string propagation',
      'Backend → Queue: env var propagation',
      'Backend → AI service: env var propagation',
    ]);
  });

  it('every rule has a defined direction', () => {
    for (const rule of PROPAGATION_RULES) {
      expect(['source→target', 'target→source']).toContain(rule.direction);
    }
  });
});

// ─── Rule: CustomDomain → Service ───────────────────────────────────────────

describe('CustomDomain → Service: domain propagation', () => {
  const rule = findRule('CustomDomain → Service: domain propagation');

  it('source predicate matches Network.CustomDomain only', () => {
    expect(rule.source('Network.CustomDomain')).toBe(true);
    expect(rule.source('Compute.Container')).toBe(false);
    expect(rule.source('')).toBe(false);
  });

  it('target predicate matches backend AND frontend types', () => {
    expect(rule.target('Compute.Container')).toBe(true);
    expect(rule.target('Compute.Backend')).toBe(true);
    expect(rule.target('Frontend.StaticSite')).toBe(true);
    expect(rule.target('SSRSite')).toBe(true);
    expect(rule.target('Database.PostgreSQL')).toBe(false);
  });

  it('uses source→target direction', () => {
    expect(rule.direction).toBe('source→target');
  });

  it('returns null when domain is empty', () => {
    const src = makeNode('cd1', 'Network.CustomDomain', { domain: '' });
    const tgt = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1');
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toBeNull();
  });

  it('returns null when domain is the placeholder example.com', () => {
    const src = makeNode('cd1', 'Network.CustomDomain', { domain: 'example.com' });
    const tgt = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1');
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toBeNull();
  });

  it('returns null when domain field is missing entirely', () => {
    const src = makeNode('cd1', 'Network.CustomDomain', {});
    const tgt = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1');
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toBeNull();
  });

  it('builds host from edge.subdomain when no routeId', () => {
    const src = makeNode('cd1', 'Network.CustomDomain', { domain: 'mysite.com' });
    const tgt = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1', { subdomain: 'api' });
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toEqual({
      domain: 'api.mysite.com',
      custom_domain: 'api.mysite.com',
    });
  });

  it('uses bare root domain when no subdomain or routeId', () => {
    const src = makeNode('cd1', 'Network.CustomDomain', { domain: 'mysite.com' });
    const tgt = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1');
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toEqual({
      domain: 'mysite.com',
      custom_domain: 'mysite.com',
    });
  });

  it('looks up subdomain via routeId when present', () => {
    const src = makeNode('cd1', 'Network.CustomDomain', {
      domain: 'mysite.com',
      routes: [
        { id: 'r1', subdomain: 'app' },
        { id: 'r2', subdomain: 'api' },
      ],
    });
    const tgt = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1', { routeId: 'r2' });
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toEqual({
      domain: 'api.mysite.com',
      custom_domain: 'api.mysite.com',
    });
  });

  it('returns null when routeId references an unknown route', () => {
    const src = makeNode('cd1', 'Network.CustomDomain', {
      domain: 'mysite.com',
      routes: [{ id: 'r1', subdomain: 'app' }],
    });
    const tgt = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1', { routeId: 'r-orphan' });
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toBeNull();
  });

  it('strips whitespace around domain and subdomain', () => {
    const src = makeNode('cd1', 'Network.CustomDomain', { domain: '  mysite.com  ' });
    const tgt = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1', { subdomain: '  www  ' });
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toEqual({
      domain: 'www.mysite.com',
      custom_domain: 'www.mysite.com',
    });
  });

  it('treats route with empty subdomain as root', () => {
    const src = makeNode('cd1', 'Network.CustomDomain', {
      domain: 'mysite.com',
      routes: [{ id: 'r1', subdomain: '' }],
    });
    const tgt = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1', { routeId: 'r1' });
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toEqual({
      domain: 'mysite.com',
      custom_domain: 'mysite.com',
    });
  });

  it('treats route with missing subdomain as root', () => {
    const src = makeNode('cd1', 'Network.CustomDomain', {
      domain: 'mysite.com',
      routes: [{ id: 'r1' }],
    });
    const tgt = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1', { routeId: 'r1' });
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toEqual({
      domain: 'mysite.com',
      custom_domain: 'mysite.com',
    });
  });

  it('routeId with no routes array on CustomDomain returns null', () => {
    const src = makeNode('cd1', 'Network.CustomDomain', { domain: 'mysite.com' });
    const tgt = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'cd1', 's1', { routeId: 'r1' });
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toBeNull();
  });
});

// ─── Rule: Repository → Service ────────────────────────────────────────────

describe('Repository → Service: source code propagation', () => {
  const rule = findRule('Repository → Service: source code propagation');

  it('source predicate matches Source.Repository only', () => {
    expect(rule.source('Source.Repository')).toBe(true);
    expect(rule.source('Compute.Container')).toBe(false);
  });

  it('target predicate matches backend and frontend services', () => {
    expect(rule.target('Compute.Container')).toBe(true);
    expect(rule.target('Frontend.StaticSite')).toBe(true);
    expect(rule.target('Database.PostgreSQL')).toBe(false);
  });

  it('returns null when repository is missing', () => {
    const src = makeNode('repo1', 'Source.Repository', {});
    const tgt = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'repo1', 's1');
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toBeNull();
  });

  it('propagates repository with default branch main', () => {
    const src = makeNode('repo1', 'Source.Repository', {
      repository: 'org/app',
    });
    const tgt = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'repo1', 's1');
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toEqual({
      repository: 'org/app',
      branch: 'main',
    });
  });

  it('uses explicit branch when present', () => {
    const src = makeNode('repo1', 'Source.Repository', {
      repository: 'org/app',
      branch: 'develop',
    });
    const tgt = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'repo1', 's1');
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toMatchObject({
      branch: 'develop',
    });
  });

  it('forwards optional buildCommand and outputDirectory', () => {
    const src = makeNode('repo1', 'Source.Repository', {
      repository: 'org/app',
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
    });
    const tgt = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'repo1', 's1');
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toEqual({
      repository: 'org/app',
      branch: 'main',
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
    });
  });

  it('omits buildCommand and outputDirectory when not set', () => {
    const src = makeNode('repo1', 'Source.Repository', {
      repository: 'org/app',
    });
    const tgt = makeNode('s1', 'Compute.Container');
    const edge = makeEdge('e1', 'repo1', 's1');
    const out = rule.compute(src, tgt, edge, EMPTY_CTX);
    expect(out).not.toHaveProperty('buildCommand');
    expect(out).not.toHaveProperty('outputDirectory');
  });
});

// ─── Rule: Service → Secret ────────────────────────────────────────────────

describe('Service → Secret: inject secret references', () => {
  const rule = findRule('Service → Secret: inject secret references');

  it('source predicate matches services', () => {
    expect(rule.source('Compute.Container')).toBe(true);
    expect(rule.source('Frontend.StaticSite')).toBe(true);
    expect(rule.source('Database.PostgreSQL')).toBe(false);
  });

  it('target predicate matches secrets', () => {
    expect(rule.target('Security.Secret')).toBe(true);
    expect(rule.target('Network.CustomDomain')).toBe(false);
  });

  it('uses target→source direction (secret data flows back to service)', () => {
    expect(rule.direction).toBe('target→source');
  });

  it('returns null when secret has no entries', () => {
    const svc = makeNode('s1', 'Compute.Container');
    const sec = makeNode('sec1', 'Security.Secret', { secrets: [] });
    const edge = makeEdge('e1', 's1', 'sec1');
    expect(rule.compute(svc, sec, edge, EMPTY_CTX)).toBeNull();
  });

  it('returns null when secret entries field is missing', () => {
    const svc = makeNode('s1', 'Compute.Container');
    const sec = makeNode('sec1', 'Security.Secret');
    const edge = makeEdge('e1', 's1', 'sec1');
    expect(rule.compute(svc, sec, edge, EMPTY_CTX)).toBeNull();
  });

  it('maps secrets to envVar/secretName pairs', () => {
    const svc = makeNode('s1', 'Compute.Container');
    const sec = makeNode('sec1', 'Security.Secret', {
      secrets: [{ key: 'API_KEY', ref: 'prod-api-key' }, { key: 'TOKEN' }],
    });
    const edge = makeEdge('e1', 's1', 'sec1');
    expect(rule.compute(svc, sec, edge, EMPTY_CTX)).toEqual({
      secretRefs: [
        { envVar: 'API_KEY', secretName: 'prod-api-key' },
        { envVar: 'TOKEN', secretName: 'TOKEN' },
      ],
    });
  });
});

// ─── Rule: Service → EnvConfig ─────────────────────────────────────────────

describe('Service → EnvConfig: inject environment variables', () => {
  const rule = findRule('Service → EnvConfig: inject environment variables');

  it('source matches services, target matches Config.Environment', () => {
    expect(rule.source('Compute.Container')).toBe(true);
    expect(rule.target('Config.Environment')).toBe(true);
    expect(rule.target('Security.Secret')).toBe(false);
  });

  it('uses target→source direction', () => {
    expect(rule.direction).toBe('target→source');
  });

  it('returns null when variables map is empty', () => {
    const svc = makeNode('s1', 'Compute.Container');
    const env = makeNode('env1', 'Config.Environment', { variables: {} });
    const edge = makeEdge('e1', 's1', 'env1');
    expect(rule.compute(svc, env, edge, EMPTY_CTX)).toBeNull();
  });

  it('returns null when variables field is missing', () => {
    const svc = makeNode('s1', 'Compute.Container');
    const env = makeNode('env1', 'Config.Environment');
    const edge = makeEdge('e1', 's1', 'env1');
    expect(rule.compute(svc, env, edge, EMPTY_CTX)).toBeNull();
  });

  it('forwards all variables as injectedEnvVars', () => {
    const svc = makeNode('s1', 'Compute.Container');
    const env = makeNode('env1', 'Config.Environment', {
      variables: { NODE_ENV: 'production', LOG_LEVEL: 'info' },
    });
    const edge = makeEdge('e1', 's1', 'env1');
    expect(rule.compute(svc, env, edge, EMPTY_CTX)).toEqual({
      injectedEnvVars: { NODE_ENV: 'production', LOG_LEVEL: 'info' },
    });
  });
});

// ─── Rule: Backend → DataStore ─────────────────────────────────────────────

describe('Backend → DataStore: connection string propagation', () => {
  const rule = findRule('Backend → DataStore: connection string propagation');

  it('source matches backends, target matches data stores', () => {
    expect(rule.source('Compute.Container')).toBe(true);
    expect(rule.target('Database.PostgreSQL')).toBe(true);
    expect(rule.target('Database.Redis')).toBe(true);
    expect(rule.target('Storage.Bucket')).toBe(true);
    expect(rule.target('Frontend.StaticSite')).toBe(false);
    expect(rule.target('Compute.Container')).toBe(false);
  });

  it('returns null when port and envVar both unknown', () => {
    const src = makeNode('s1', 'Compute.Container');
    // unknown iceType — neither DEFAULT_PORTS nor DEFAULT_ENV_VARS has it
    const tgt = makeNode('db1', 'Database.UnknownDB');
    const edge = makeEdge('e1', 's1', 'db1');
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toBeNull();
  });

  it('uses DEFAULT_PORTS / DEFAULT_ENV_VARS for known PostgreSQL', () => {
    const src = makeNode('s1', 'Compute.Container');
    const tgt = makeNode('db1', 'Database.PostgreSQL');
    const edge = makeEdge('e1', 's1', 'db1');
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toEqual({
      port: 5432,
      envVarName: 'DATABASE_URL',
    });
  });

  it('edge-level port/envVarName override defaults', () => {
    const src = makeNode('s1', 'Compute.Container');
    const tgt = makeNode('db1', 'Database.PostgreSQL');
    const edge = makeEdge('e1', 's1', 'db1', { port: 9999, envVarName: 'CUSTOM_URL' });
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toEqual({
      port: 9999,
      envVarName: 'CUSTOM_URL',
    });
  });

  it('storage bucket has envVar but no port — patch contains only envVarName', () => {
    const src = makeNode('s1', 'Compute.Container');
    const tgt = makeNode('bk1', 'Storage.Bucket');
    const edge = makeEdge('e1', 's1', 'bk1');
    const out = rule.compute(src, tgt, edge, EMPTY_CTX);
    expect(out).toEqual({ envVarName: 'STORAGE_BUCKET' });
  });
});

// ─── Rule: Backend → Queue ─────────────────────────────────────────────────

describe('Backend → Queue: env var propagation', () => {
  const rule = findRule('Backend → Queue: env var propagation');

  it('source matches backends, target matches queues', () => {
    expect(rule.source('Compute.Container')).toBe(true);
    expect(rule.target('Messaging.SQS')).toBe(true);
    expect(rule.target('Messaging.Queue')).toBe(true);
    expect(rule.target('Database.PostgreSQL')).toBe(false);
  });

  it('returns null when envVar is unknown', () => {
    const src = makeNode('s1', 'Compute.Container');
    const tgt = makeNode('q1', 'Messaging.Unknown');
    const edge = makeEdge('e1', 's1', 'q1');
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toBeNull();
  });

  it('uses DEFAULT_ENV_VARS for known queue', () => {
    const src = makeNode('s1', 'Compute.Container');
    const tgt = makeNode('q1', 'Messaging.SQS');
    const edge = makeEdge('e1', 's1', 'q1');
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toEqual({
      envVarName: 'SQS_QUEUE_URL',
    });
  });

  it('edge-level envVarName overrides default', () => {
    const src = makeNode('s1', 'Compute.Container');
    const tgt = makeNode('q1', 'Messaging.SQS');
    const edge = makeEdge('e1', 's1', 'q1', { envVarName: 'JOBS_QUEUE_URL' });
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toEqual({
      envVarName: 'JOBS_QUEUE_URL',
    });
  });
});

// ─── Rule: Backend → AI service ────────────────────────────────────────────

describe('Backend → AI service: env var propagation', () => {
  const rule = findRule('Backend → AI service: env var propagation');

  it('source matches backends', () => {
    expect(rule.source('Compute.Container')).toBe(true);
    expect(rule.source('Database.PostgreSQL')).toBe(false);
  });

  it('target matches LLM and VectorDB types', () => {
    expect(rule.target('AI.LLMGateway')).toBe(true);
    expect(rule.target('AI.ModelServing')).toBe(true);
    expect(rule.target('AI.VectorDB')).toBe(true);
    expect(rule.target('Database.PostgreSQL')).toBe(false);
  });

  it('returns null when envVar unknown', () => {
    const src = makeNode('s1', 'Compute.Container');
    const tgt = makeNode('llm1', 'AI.UnknownAI');
    const edge = makeEdge('e1', 's1', 'llm1');
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toBeNull();
  });

  it('uses edge-level envVarName when supplied', () => {
    const src = makeNode('s1', 'Compute.Container');
    const tgt = makeNode('llm1', 'AI.UnknownAI');
    const edge = makeEdge('e1', 's1', 'llm1', { envVarName: 'OPENAI_KEY' });
    expect(rule.compute(src, tgt, edge, EMPTY_CTX)).toEqual({
      envVarName: 'OPENAI_KEY',
    });
  });
});

// ─── Aggregate: DataStore → allowedClients ─────────────────────────────────

describe('DataStore: derive allowedClients from inbound traffic edges', () => {
  const rule = findAggregate('DataStore: derive allowedClients from inbound traffic edges');

  it('appliesTo data stores only', () => {
    expect(rule.appliesTo('Database.PostgreSQL')).toBe(true);
    expect(rule.appliesTo('Storage.Bucket')).toBe(true);
    expect(rule.appliesTo('Compute.Container')).toBe(false);
  });

  it('returns empty allowedClients with no inbound edges', () => {
    const node = makeNode('db1', 'Database.PostgreSQL');
    const out = rule.compute(node, [], [], EMPTY_CTX);
    expect(out).toEqual({ allowedClients: [] });
  });

  it('filters to traffic edges only and projects nodeId/label/iceType', () => {
    const node = makeNode('db1', 'Database.PostgreSQL');
    const inboundA = makeNode('a1', 'Compute.Container', { label: 'API' });
    const inboundB = makeNode('b1', 'Compute.Container');
    const inboundC = makeNode('c1', 'Compute.Container');
    const inbound = [
      {
        edge: makeEdge('e1', 'a1', 'db1', { connectionCategory: 'traffic' }),
        sourceNode: inboundA,
      },
      {
        edge: makeEdge('e2', 'b1', 'db1', { connectionCategory: 'config' }),
        sourceNode: inboundB,
      },
      {
        edge: makeEdge('e3', 'c1', 'db1', { connectionCategory: 'traffic' }),
        sourceNode: inboundC,
      },
    ];
    expect(rule.compute(node, inbound, [], EMPTY_CTX)).toEqual({
      allowedClients: [
        { nodeId: 'a1', label: 'API', iceType: 'Compute.Container' },
        { nodeId: 'c1', label: 'c1', iceType: 'Compute.Container' },
      ],
    });
  });

  it('falls back to nodeId when label is missing', () => {
    const node = makeNode('db1', 'Database.PostgreSQL');
    const inboundA = makeNode('a1', 'Compute.Container');
    const inbound = [
      {
        edge: makeEdge('e1', 'a1', 'db1', { connectionCategory: 'traffic' }),
        sourceNode: inboundA,
      },
    ];
    expect(rule.compute(node, inbound, [], EMPTY_CTX)).toEqual({
      allowedClients: [{ nodeId: 'a1', label: 'a1', iceType: 'Compute.Container' }],
    });
  });

  it('treats edges without connectionCategory as non-traffic', () => {
    const node = makeNode('db1', 'Database.PostgreSQL');
    const inbound = [
      {
        edge: makeEdge('e1', 'a1', 'db1'),
        sourceNode: makeNode('a1', 'Compute.Container'),
      },
    ];
    expect(rule.compute(node, inbound, [], EMPTY_CTX)).toEqual({ allowedClients: [] });
  });
});

// ─── Aggregate: Queue → allowedClients ─────────────────────────────────────

describe('Queue: derive allowedClients from connected services', () => {
  const rule = findAggregate('Queue: derive allowedClients from connected services');

  it('appliesTo queues only', () => {
    expect(rule.appliesTo('Messaging.SQS')).toBe(true);
    expect(rule.appliesTo('Database.PostgreSQL')).toBe(false);
  });

  it('returns publisher + subscriber roles separately and filters non-traffic', () => {
    const queue = makeNode('q1', 'Messaging.SQS');
    const inbound = [
      {
        edge: makeEdge('e1', 'pub1', 'q1', { connectionCategory: 'traffic' }),
        sourceNode: makeNode('pub1', 'Compute.Container', { label: 'Publisher' }),
      },
      {
        edge: makeEdge('e2', 'noise', 'q1', { connectionCategory: 'config' }),
        sourceNode: makeNode('noise', 'Compute.Container'),
      },
    ];
    const outbound = [
      {
        edge: makeEdge('e3', 'q1', 'sub1', { connectionCategory: 'traffic' }),
        targetNode: makeNode('sub1', 'Compute.Container', { label: 'Subscriber' }),
      },
      {
        edge: makeEdge('e4', 'q1', 'noise2'),
        targetNode: makeNode('noise2', 'Compute.Container'),
      },
    ];

    expect(rule.compute(queue, inbound, outbound, EMPTY_CTX)).toEqual({
      allowedClients: [
        {
          nodeId: 'pub1',
          label: 'Publisher',
          iceType: 'Compute.Container',
          role: 'publisher',
        },
        {
          nodeId: 'sub1',
          label: 'Subscriber',
          iceType: 'Compute.Container',
          role: 'subscriber',
        },
      ],
    });
  });

  it('falls back to nodeId labels for both publishers and subscribers', () => {
    const queue = makeNode('q1', 'Messaging.SQS');
    const inbound = [
      {
        edge: makeEdge('e1', 'p', 'q1', { connectionCategory: 'traffic' }),
        sourceNode: makeNode('p', 'Compute.Container'),
      },
    ];
    const outbound = [
      {
        edge: makeEdge('e2', 'q1', 's', { connectionCategory: 'traffic' }),
        targetNode: makeNode('s', 'Compute.Container'),
      },
    ];
    expect(rule.compute(queue, inbound, outbound, EMPTY_CTX)).toEqual({
      allowedClients: [
        { nodeId: 'p', label: 'p', iceType: 'Compute.Container', role: 'publisher' },
        { nodeId: 's', label: 's', iceType: 'Compute.Container', role: 'subscriber' },
      ],
    });
  });

  it('treats edges with no data field as non-traffic', () => {
    const queue = makeNode('q1', 'Messaging.SQS');
    const inbound = [
      {
        edge: { id: 'e1', source: 'p', target: 'q1' } as PropagationEdge,
        sourceNode: makeNode('p', 'Compute.Container'),
      },
    ];
    const outbound = [
      {
        edge: { id: 'e2', source: 'q1', target: 's' } as PropagationEdge,
        targetNode: makeNode('s', 'Compute.Container'),
      },
    ];
    expect(rule.compute(queue, inbound, outbound, EMPTY_CTX)).toEqual({
      allowedClients: [],
    });
  });

  it('falls back to empty-string iceType when source/target nodes lack iceType field', () => {
    const queue = makeNode('q1', 'Messaging.SQS');
    const blankPub: PropagationNode = { id: 'p', type: 'block', data: { label: 'pub' } };
    const blankSub: PropagationNode = { id: 's', type: 'block', data: { label: 'sub' } };
    const inbound = [
      {
        edge: makeEdge('e1', 'p', 'q1', { connectionCategory: 'traffic' }),
        sourceNode: blankPub,
      },
    ];
    const outbound = [
      {
        edge: makeEdge('e2', 'q1', 's', { connectionCategory: 'traffic' }),
        targetNode: blankSub,
      },
    ];
    expect(rule.compute(queue, inbound, outbound, EMPTY_CTX)).toEqual({
      allowedClients: [
        { nodeId: 'p', label: 'pub', iceType: '', role: 'publisher' },
        { nodeId: 's', label: 'sub', iceType: '', role: 'subscriber' },
      ],
    });
  });
});

// ─── Aggregate: Service → allowedTargets ───────────────────────────────────

describe('Service: derive allowedTargets from outbound traffic edges', () => {
  const rule = findAggregate('Service: derive allowedTargets from outbound traffic edges');

  it('appliesTo backends and frontends', () => {
    expect(rule.appliesTo('Compute.Container')).toBe(true);
    expect(rule.appliesTo('Frontend.StaticSite')).toBe(true);
    expect(rule.appliesTo('Database.PostgreSQL')).toBe(false);
  });

  it('aggregates outbound traffic targets only', () => {
    const node = makeNode('s1', 'Compute.Container');
    const outbound = [
      {
        edge: makeEdge('e1', 's1', 'db1', { connectionCategory: 'traffic' }),
        targetNode: makeNode('db1', 'Database.PostgreSQL', { label: 'Primary' }),
      },
      {
        edge: makeEdge('e2', 's1', 'env1', { connectionCategory: 'config' }),
        targetNode: makeNode('env1', 'Config.Environment'),
      },
    ];
    expect(rule.compute(node, [], outbound, EMPTY_CTX)).toEqual({
      allowedTargets: [{ nodeId: 'db1', label: 'Primary', iceType: 'Database.PostgreSQL' }],
    });
  });

  it('falls back to nodeId when target label is missing', () => {
    const node = makeNode('s1', 'Compute.Container');
    const outbound = [
      {
        edge: makeEdge('e1', 's1', 'db1', { connectionCategory: 'traffic' }),
        targetNode: makeNode('db1', 'Database.PostgreSQL'),
      },
    ];
    expect(rule.compute(node, [], outbound, EMPTY_CTX)).toEqual({
      allowedTargets: [{ nodeId: 'db1', label: 'db1', iceType: 'Database.PostgreSQL' }],
    });
  });

  it('returns empty allowedTargets when no outbound edges', () => {
    const node = makeNode('s1', 'Compute.Container');
    expect(rule.compute(node, [], [], EMPTY_CTX)).toEqual({ allowedTargets: [] });
  });
});

// ─── Classifier coverage via predicates ────────────────────────────────────
// The internal classifiers (isBackend, isCache, isSearch, isVectorDb, isLLM,
// isDataWarehouse) aren't exported directly. The propagation rules' source
// and target predicates wrap them, so we exercise each branch through rule
// predicates. This isn't an internal-implementation test — it verifies the
// rule registry itself accepts the relevant iceTypes and rejects others.

describe('classifier branch coverage via rule predicates', () => {
  const dsRule = findRule('Backend → DataStore: connection string propagation');
  const aiRule = findRule('Backend → AI service: env var propagation');
  const queueRule = findRule('Backend → Queue: env var propagation');
  const cdRule = findRule('CustomDomain → Service: domain propagation');

  it('Backend predicate covers Worker, Function, CronJob, AppPlatform, OCIFunctions, Container prefix', () => {
    expect(dsRule.source('Compute.Backend')).toBe(true);
    expect(dsRule.source('Compute.Worker')).toBe(true);
    expect(dsRule.source('Compute.Function')).toBe(true);
    expect(dsRule.source('Compute.CronJob')).toBe(true);
    expect(dsRule.source('Compute.ScheduledJob')).toBe(true);
    expect(dsRule.source('Azure.AppPlatform')).toBe(true);
    expect(dsRule.source('OCI.OCIFunctions')).toBe(true);
  });

  it('Frontend predicate via CustomDomain target covers SSRSite/Frontend/StaticSite', () => {
    expect(cdRule.target('SSRSite')).toBe(true);
    expect(cdRule.target('Frontend.StaticSite')).toBe(true);
    expect(cdRule.target('My.Frontend')).toBe(true);
  });

  it('Cache predicate matches Redis/Memcache/Cache via DataStore target', () => {
    expect(dsRule.target('Cache.Redis')).toBe(true);
    expect(dsRule.target('Database.Redis')).toBe(true);
    expect(dsRule.target('Cache.Memcache')).toBe(true);
  });

  it('Storage predicate matches S3/GCS/Blob/ObjectStorage/Spaces via DataStore target', () => {
    expect(dsRule.target('AWS.S3')).toBe(true);
    expect(dsRule.target('GCP.GCS')).toBe(true);
    expect(dsRule.target('Azure.Blob')).toBe(true);
    expect(dsRule.target('OCI.ObjectStorage')).toBe(true);
    expect(dsRule.target('DO.Spaces')).toBe(true);
  });

  it('Search predicate matches Search/Elasticsearch/Analytics.Search via DataStore target', () => {
    expect(dsRule.target('Database.Elasticsearch')).toBe(true);
    expect(dsRule.target('Analytics.Search')).toBe(true);
    expect(dsRule.target('Some.Search')).toBe(true);
  });

  it('VectorDB predicate matches via AI rule target', () => {
    expect(aiRule.target('AI.VectorDB')).toBe(true);
    expect(aiRule.target('Custom.VectorDB')).toBe(true);
    expect(aiRule.target('Some.Vector')).toBe(true);
  });

  it('LLM predicate matches AI.LLMGateway, AI.ModelServing, ModelServing prefix', () => {
    expect(aiRule.target('AI.LLMGateway')).toBe(true);
    expect(aiRule.target('AI.ModelServing')).toBe(true);
    expect(aiRule.target('Custom.LLM')).toBe(true);
  });

  it('DataWarehouse predicate matches BigQuery/Redshift/Synapse/Analytics.DataWarehouse', () => {
    expect(dsRule.target('GCP.BigQuery')).toBe(true);
    expect(dsRule.target('AWS.Redshift')).toBe(true);
    expect(dsRule.target('Azure.Synapse')).toBe(true);
    expect(dsRule.target('Analytics.DataWarehouse')).toBe(true);
  });

  it('Queue predicate matches SNS, PubSub, ServiceBus, RabbitMQ, Kafka, Event prefix', () => {
    expect(queueRule.target('Messaging.SNS')).toBe(true);
    expect(queueRule.target('GCP.PubSub')).toBe(true);
    expect(queueRule.target('Azure.ServiceBus')).toBe(true);
    expect(queueRule.target('Messaging.RabbitMQ')).toBe(true);
    expect(queueRule.target('Messaging.Kafka')).toBe(true);
    expect(queueRule.target('Messaging.EventStream')).toBe(true);
  });
});
