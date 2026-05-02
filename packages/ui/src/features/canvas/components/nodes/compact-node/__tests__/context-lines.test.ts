/**
 * Tests for `getContextLines` — the pure helper that picks the most
 * relevant context lines per block resourceId, rendered under the
 * label/header on the compact node.
 *
 * Branch focus: each `case` arm has at least one happy-path + one
 * empty-data path, so the placeholder vs real-value branches in `||
 * ph(...)` short-circuits both ways. The default arm covers
 * Source.Repository (with/without repository, with/without branch),
 * Config.Environment (with/without variables), and the
 * `purpose ? + size?` fallthrough.
 */

import { describe, it, expect } from 'vitest';
import { getContextLines } from '../context-lines';

describe('getContextLines — frontend / ssr', () => {
  it('frontend-app shows hostname + framework when set', () => {
    const r = getContextLines(
      { resourceId: 'frontend-app', custom_domain: 'https://app.example.com', framework: 'Next.js' },
      'Compute.Frontend',
    );
    expect(r.lines).toEqual(['app.example.com', 'Next.js']);
    expect(r.repoLineIndex).toBe(-1);
  });

  it('frontend-app falls back to placeholder domain when no domain set, omits framework when missing', () => {
    const r = getContextLines({ resourceId: 'frontend-app' }, 'Compute.Frontend');
    expect(r.lines.length).toBe(1);
    expect(r.lines[0]).toContain('app.example.com');
    expect(r.lines[0].startsWith(' ')).toBe(true);
  });

  it('ssr-site shows hostname + framework display variant', () => {
    const r = getContextLines(
      { resourceId: 'ssr-site', custom_domain: 'https://www.example.com/foo', framework_display: 'Astro 4.x' },
      'Compute.SSR',
    );
    expect(r.lines).toEqual(['www.example.com', 'Astro 4.x']);
  });

  it('ssr-site falls back to placeholder domain when no domain set', () => {
    const r = getContextLines({ resourceId: 'ssr-site' }, 'Compute.SSR');
    expect(r.lines.length).toBe(1);
    expect(r.lines[0].startsWith(' ')).toBe(true);
  });
});

describe('getContextLines — compute', () => {
  it('backend-api emits purpose + size lines', () => {
    const r = getContextLines({ resourceId: 'backend-api', purpose: 'orders', size: '512MB' }, 'Compute.BackendAPI');
    expect(r.lines).toEqual(['orders', '512MB']);
  });

  it('backend-api with no purpose/size emits no lines', () => {
    const r = getContextLines({ resourceId: 'backend-api' }, 'Compute.BackendAPI');
    expect(r.lines).toEqual([]);
  });

  it('container-service shares the backend-api branch', () => {
    const r = getContextLines({ resourceId: 'container-service', purpose: 'web', size: '1GB' }, 'Compute.Container');
    expect(r.lines).toEqual(['web', '1GB']);
  });

  it('worker emits purpose + size only when set', () => {
    expect(getContextLines({ resourceId: 'worker' }, 'Compute.Worker').lines).toEqual([]);
    expect(
      getContextLines({ resourceId: 'worker', purpose: 'queue-consumer' }, 'Compute.Worker').lines,
    ).toEqual(['queue-consumer']);
  });

  it('serverless-function/function-compute/oci-functions all share the purpose/size branch', () => {
    for (const id of ['serverless-function', 'function-compute', 'oci-functions']) {
      const r = getContextLines({ resourceId: id, purpose: 'p', size: 's' }, 'Compute.Serverless');
      expect(r.lines).toEqual(['p', 's']);
    }
  });

  it('do-app-platform emits purpose + size', () => {
    const r = getContextLines({ resourceId: 'do-app-platform', purpose: 'web' }, 'Compute');
    expect(r.lines).toEqual(['web']);
  });

  it('scheduled-task uses frequency or placeholder', () => {
    expect(getContextLines({ resourceId: 'scheduled-task', frequency: '5m' }, 'Compute').lines).toEqual(['5m']);
    const ph = getContextLines({ resourceId: 'scheduled-task' }, 'Compute');
    expect(ph.lines.length).toBe(1);
    expect(ph.lines[0].startsWith(' ')).toBe(true);
  });
});

describe('getContextLines — database', () => {
  it('postgres-db emits size + Production-ready when production=true', () => {
    const r = getContextLines({ resourceId: 'postgres-db', size: 'medium', production: true }, 'Database.SQL');
    expect(r.lines).toEqual(['medium', 'Production-ready']);
  });

  it('postgres-db emits placeholder Dev-mode when production falsy', () => {
    const r = getContextLines({ resourceId: 'postgres-db' }, 'Database.SQL');
    expect(r.lines.length).toBe(1);
    expect(r.lines[0].startsWith(' ')).toBe(true);
  });

  it('mysql-db shares the postgres path', () => {
    const r = getContextLines({ resourceId: 'mysql-db', production: true }, 'Database.SQL');
    expect(r.lines).toEqual(['Production-ready']);
  });

  it('mongodb shares production-mode pattern', () => {
    const r = getContextLines({ resourceId: 'mongodb', size: 'small', production: false }, 'Database.NoSQL');
    expect(r.lines.length).toBe(2);
    expect(r.lines[0]).toBe('small');
    expect(r.lines[1].startsWith(' ')).toBe(true);
  });

  it('redis-cache emits purpose + size', () => {
    expect(
      getContextLines({ resourceId: 'redis-cache', purpose: 'session', size: 'small' }, 'Cache').lines,
    ).toEqual(['session', 'small']);
    expect(getContextLines({ resourceId: 'redis-cache' }, 'Cache').lines).toEqual([]);
  });

  it('dynamodb emits size + key info', () => {
    const r = getContextLines({ resourceId: 'dynamodb', size: 's', lookup_field: 'id' }, 'Database');
    expect(r.lines).toEqual(['s', 'key: id']);
    expect(getContextLines({ resourceId: 'dynamodb' }, 'Database').lines).toEqual([]);
  });

  it('firestore emits purpose + size', () => {
    expect(getContextLines({ resourceId: 'firestore', purpose: 'p', size: 's' }, 'Database').lines).toEqual(['p', 's']);
    expect(getContextLines({ resourceId: 'firestore' }, 'Database').lines).toEqual([]);
  });

  it('cosmosdb emits purpose + size', () => {
    expect(getContextLines({ resourceId: 'cosmosdb', purpose: 'p', size: 's' }, 'Database').lines).toEqual(['p', 's']);
    expect(getContextLines({ resourceId: 'cosmosdb' }, 'Database').lines).toEqual([]);
  });

  it('vector-db / data-warehouse / search-engine emit purpose + engine', () => {
    for (const id of ['vector-db', 'data-warehouse', 'search-engine']) {
      const r = getContextLines({ resourceId: id, purpose: 'a', engine: 'b' }, 'AI');
      expect(r.lines).toEqual(['a', 'b']);
      expect(getContextLines({ resourceId: id }, 'AI').lines).toEqual([]);
    }
  });
});

describe('getContextLines — messaging', () => {
  it('message-queue uses queue count when array set', () => {
    expect(
      getContextLines({ resourceId: 'message-queue', queues: ['a'] }, 'Msg').lines,
    ).toEqual(['1 queue']);
    expect(
      getContextLines({ resourceId: 'message-queue', queues: ['a', 'b'] }, 'Msg').lines,
    ).toEqual(['2 queues']);
  });

  it('message-queue with no queues + order_matters yields FIFO line', () => {
    expect(
      getContextLines({ resourceId: 'message-queue', order_matters: true }, 'Msg').lines,
    ).toEqual(['FIFO (ordered)']);
  });

  it('message-queue with no queues and no order yields placeholder', () => {
    const r = getContextLines({ resourceId: 'message-queue' }, 'Msg');
    expect(r.lines.length).toBe(1);
    expect(r.lines[0].startsWith(' ')).toBe(true);
  });

  it('event-bus prepends purpose then subscriber count', () => {
    expect(
      getContextLines(
        { resourceId: 'event-bus', purpose: 'orders', subscribers: ['a', 'b', 'c'] },
        'Msg',
      ).lines,
    ).toEqual(['orders', '3 subscribers']);
  });

  it('event-bus with no subscribers shows placeholder line', () => {
    const r = getContextLines({ resourceId: 'event-bus' }, 'Msg');
    expect(r.lines.length).toBe(1);
    expect(r.lines[0].startsWith(' ')).toBe(true);
  });

  it('rabbitmq emits purpose + queues count when both set', () => {
    expect(
      getContextLines({ resourceId: 'rabbitmq', purpose: 'audio', queues: ['x'] }, 'Msg').lines,
    ).toEqual(['audio', '1 queues']);
    expect(getContextLines({ resourceId: 'rabbitmq' }, 'Msg').lines).toEqual([]);
  });

  it('cloud-pubsub emits purpose + listeners when both set', () => {
    expect(
      getContextLines({ resourceId: 'cloud-pubsub', purpose: 'p', subscribers: ['a', 'b'] }, 'Msg').lines,
    ).toEqual(['p', '2 listeners']);
    expect(getContextLines({ resourceId: 'cloud-pubsub' }, 'Msg').lines).toEqual([]);
  });

  it('service-bus emits purpose + queue/topic combination', () => {
    const r = getContextLines(
      { resourceId: 'service-bus', purpose: 'p', queues: ['q'], topics: ['t1', 't2'] },
      'Msg',
    );
    expect(r.lines).toEqual(['p', '1 queues · 2 topics']);
  });

  it('service-bus with only queues', () => {
    const r = getContextLines({ resourceId: 'service-bus', queues: ['q'] }, 'Msg');
    expect(r.lines).toEqual(['1 queues']);
  });

  it('service-bus with only topics', () => {
    const r = getContextLines({ resourceId: 'service-bus', topics: ['t'] }, 'Msg');
    expect(r.lines).toEqual(['1 topics']);
  });

  it('service-bus with neither queues nor topics returns []', () => {
    expect(getContextLines({ resourceId: 'service-bus' }, 'Msg').lines).toEqual([]);
  });

  it('event-stream emits purpose + retain', () => {
    const r = getContextLines(
      { resourceId: 'event-stream', purpose: 'p', keep_data: '7d' },
      'Msg',
    );
    expect(r.lines).toEqual(['p', 'retain: 7d']);
    expect(getContextLines({ resourceId: 'event-stream' }, 'Msg').lines).toEqual([]);
  });

  it('email-service uses from_address when set, placeholder otherwise', () => {
    expect(
      getContextLines({ resourceId: 'email-service', from_address: 'noreply@x.com' }, 'Msg').lines,
    ).toEqual(['noreply@x.com']);
    const ph = getContextLines({ resourceId: 'email-service' }, 'Msg');
    expect(ph.lines.length).toBe(1);
    expect(ph.lines[0].startsWith(' ')).toBe(true);
  });
});

describe('getContextLines — storage', () => {
  it('object-storage emits purpose + Public access when public=true', () => {
    expect(
      getContextLines({ resourceId: 'object-storage', purpose: 'avatars', public: true }, 'Storage').lines,
    ).toEqual(['avatars', 'Public access']);
  });

  it('object-storage emits Private when public is falsy', () => {
    expect(getContextLines({ resourceId: 'object-storage' }, 'Storage').lines).toEqual(['Private']);
  });

  it('file-storage emits purpose + size', () => {
    expect(
      getContextLines({ resourceId: 'file-storage', purpose: 'shared', size: '500GB' }, 'Storage').lines,
    ).toEqual(['shared', '500GB']);
    expect(getContextLines({ resourceId: 'file-storage' }, 'Storage').lines).toEqual([]);
  });
});

describe('getContextLines — network', () => {
  it('api-gateway emits purpose + routes count', () => {
    expect(
      getContextLines(
        { resourceId: 'api-gateway', purpose: 'p', routes: ['a', 'b'] },
        'Network',
      ).lines,
    ).toEqual(['p', '2 routes']);
    expect(getContextLines({ resourceId: 'api-gateway' }, 'Network').lines).toEqual([]);
  });

  it('dns-zone emits domain + subdomain count', () => {
    expect(
      getContextLines(
        { resourceId: 'dns-zone', domain: 'example.com', subdomains: ['a'] },
        'Network',
      ).lines,
    ).toEqual(['example.com', '1 subdomains']);
  });

  it('dns-zone with no domain falls back to placeholder', () => {
    const r = getContextLines({ resourceId: 'dns-zone' }, 'Network');
    expect(r.lines.length).toBe(1);
    expect(r.lines[0].startsWith(' ')).toBe(true);
  });

  it('public-traffic uses domain when set, no line otherwise', () => {
    expect(
      getContextLines({ resourceId: 'public-traffic', domain: 'app.example.com' }, 'Network').lines,
    ).toEqual(['app.example.com']);
    expect(getContextLines({ resourceId: 'public-traffic' }, 'Network').lines).toEqual([]);
  });

  it('load-balancer emits purpose only', () => {
    expect(getContextLines({ resourceId: 'load-balancer', purpose: 'p' }, 'Network').lines).toEqual(['p']);
    expect(getContextLines({ resourceId: 'load-balancer' }, 'Network').lines).toEqual([]);
  });

  it('cdn emits purpose + domain', () => {
    expect(
      getContextLines(
        { resourceId: 'cdn', purpose: 'edge', domain: 'static.example.com' },
        'Network',
      ).lines,
    ).toEqual(['edge', 'static.example.com']);
    expect(getContextLines({ resourceId: 'cdn' }, 'Network').lines).toEqual([]);
  });
});

describe('getContextLines — security', () => {
  it('secret-store emits purpose + count', () => {
    expect(
      getContextLines(
        { resourceId: 'secret-store', purpose: 'p', secrets: ['a', 'b'] },
        'Security',
      ).lines,
    ).toEqual(['p', '2 secrets']);
  });

  it('secret-store with no secrets emits placeholder', () => {
    const r = getContextLines({ resourceId: 'secret-store' }, 'Security');
    expect(r.lines.length).toBe(1);
    expect(r.lines[0].startsWith(' ')).toBe(true);
  });

  it('ssl-certificate emits domain when set', () => {
    expect(
      getContextLines({ resourceId: 'ssl-certificate', domain: 'example.com' }, 'Security').lines,
    ).toEqual(['example.com']);
    expect(getContextLines({ resourceId: 'ssl-certificate' }, 'Security').lines).toEqual([]);
  });

  it('service-account emits purpose only', () => {
    expect(getContextLines({ resourceId: 'service-account', purpose: 'p' }, 'Security').lines).toEqual(['p']);
    expect(getContextLines({ resourceId: 'service-account' }, 'Security').lines).toEqual([]);
  });
});

describe('getContextLines — AI', () => {
  it('llm-gateway emits purpose + size', () => {
    expect(
      getContextLines({ resourceId: 'llm-gateway', purpose: 'p', size: 'l' }, 'AI').lines,
    ).toEqual(['p', 'l']);
    expect(getContextLines({ resourceId: 'llm-gateway' }, 'AI').lines).toEqual([]);
  });

  it('ml-model emits purpose + framework', () => {
    expect(
      getContextLines({ resourceId: 'ml-model', purpose: 'p', framework: 'pytorch' }, 'AI').lines,
    ).toEqual(['p', 'pytorch']);
    expect(getContextLines({ resourceId: 'ml-model' }, 'AI').lines).toEqual([]);
  });

  it('private-ai-service emits model + gpu_type', () => {
    expect(
      getContextLines(
        { resourceId: 'private-ai-service', model: 'mistral-7b', gpu_type: 'A100' },
        'AI',
      ).lines,
    ).toEqual(['mistral-7b', 'A100']);
    expect(getContextLines({ resourceId: 'private-ai-service' }, 'AI').lines).toEqual([]);
  });
});

describe('getContextLines — default branch', () => {
  it('Source.Repository: emits repository line + branch line, sets repoLineIndex=0', () => {
    const r = getContextLines(
      { repository: 'github.com/octocat/hello.git', branch: 'main' },
      'Source.Repository',
    );
    expect(r.repoLineIndex).toBe(0);
    expect(r.lines[0]).toBe('octocat/hello');
    expect(r.lines[1]).toBe('→ main');
  });

  it('Source.Repository falls back to placeholders for repo+branch when both empty', () => {
    const r = getContextLines({}, 'Source.Repository');
    expect(r.repoLineIndex).toBe(0);
    expect(r.lines.length).toBe(2);
    expect(r.lines[0].startsWith(' ')).toBe(true);
    expect(r.lines[1].startsWith(' ')).toBe(true);
  });

  it('Source.Repository alternate field names: github / repo also resolve', () => {
    expect(
      getContextLines({ github: 'github.com/o/r' }, 'Source.Repository').lines[0],
    ).toBe('o/r');
    expect(
      getContextLines({ repo: 'github.com/o/r' }, 'Source.Repository').lines[0],
    ).toBe('o/r');
  });

  it('Config.Environment with variables array emits count line', () => {
    expect(
      getContextLines({ variables: ['a', 'b'] }, 'Config.Environment').lines,
    ).toEqual(['2 variables']);
  });

  it('Config.Environment with no variables shows placeholder', () => {
    const r = getContextLines({}, 'Config.Environment');
    expect(r.lines.length).toBe(1);
    expect(r.lines[0].startsWith(' ')).toBe(true);
  });

  it('default arm: purpose-only emits a line, with size if also present', () => {
    expect(getContextLines({ purpose: 'p' }, 'Other').lines).toEqual(['p']);
    expect(getContextLines({ purpose: 'p', size: 's' }, 'Other').lines).toEqual(['p', 's']);
  });

  it('default arm: no purpose yields no lines', () => {
    expect(getContextLines({}, 'Other').lines).toEqual([]);
  });

  it('display companion fields take priority over base fields', () => {
    expect(
      getContextLines({ resourceId: 'backend-api', purpose: 'raw', purpose_display: 'Display Form' }, '').lines,
    ).toEqual(['Display Form']);
  });
});
