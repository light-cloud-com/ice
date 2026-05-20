/**
 * Architecture Validation Rule Tests
 *
 * Drives validateArchitecture across the four high-level checks:
 * frontend-without-backend, no-auth-prod, no-monitoring-prod,
 * no-domain-prod, multi-db-no-cache.
 */

import { describe, it, expect } from 'vitest';
import { validateArchitecture } from '../architecture-rules';
import type { ValidatableNode, ValidatableEdge } from '../types';

const node = (
  id: string,
  iceType: string,
  data: Record<string, unknown> = {},
  type: string = 'resource',
): ValidatableNode => ({ id, type, data: { iceType, ...data } });

const edge = (id: string, source: string, target: string, data?: Record<string, unknown>): ValidatableEdge => ({
  id,
  source,
  target,
  data,
});

describe('validateArchitecture', () => {
  it('returns no issues for an empty graph', () => {
    expect(validateArchitecture([], [], { mode: 'pre-deploy' })).toEqual([]);
  });

  it('flags a frontend that has no backend resource anywhere in the graph', () => {
    const issues = validateArchitecture([node('fe', 'Compute.StaticSite', { label: 'Marketing Site' })], [], {
      mode: 'pre-deploy',
    });
    const r = issues.find((i) => i.code === 'NO_BACKEND_FOR_FRONTEND');
    expect(r?.severity).toBe('info');
    expect(r?.message).toContain('Marketing Site');
  });

  it('uses generic "Frontend" label when no label is set', () => {
    const issues = validateArchitecture([node('fe', 'Compute.StaticSite')], [], { mode: 'pre-deploy' });
    expect(issues.find((i) => i.code === 'NO_BACKEND_FOR_FRONTEND')?.message).toContain('Frontend');
  });

  it('does not flag the frontend when a backend exists in the graph (even unconnected)', () => {
    const issues = validateArchitecture([node('fe', 'Compute.StaticSite'), node('be', 'Compute.BackendAPI')], [], {
      mode: 'pre-deploy',
    });
    // Source code: only flags when `backends.length === 0`. So a disconnected
    // backend in the graph still suppresses the warning.
    expect(issues.find((i) => i.code === 'NO_BACKEND_FOR_FRONTEND')).toBeUndefined();
  });

  it('does not flag the frontend when it connects directly to a backend', () => {
    const issues = validateArchitecture(
      [node('fe', 'Compute.StaticSite'), node('be', 'Compute.BackendAPI')],
      [edge('e1', 'fe', 'be')],
      { mode: 'pre-deploy' },
    );
    expect(issues.find((i) => i.code === 'NO_BACKEND_FOR_FRONTEND')).toBeUndefined();
  });

  it('does not flag the frontend when it connects to a gateway', () => {
    const issues = validateArchitecture(
      [node('fe', 'Compute.StaticSite'), node('gw', 'Network.Gateway')],
      [edge('e1', 'fe', 'gw')],
      { mode: 'pre-deploy' },
    );
    expect(issues.find((i) => i.code === 'NO_BACKEND_FOR_FRONTEND')).toBeUndefined();
  });

  it('skips containers when classifying nodes', () => {
    const issues = validateArchitecture(
      [node('vpc', 'Network.VPC', {}, 'container'), node('fe', 'Compute.StaticSite')],
      [],
      { mode: 'pre-deploy' },
    );
    // VPC isn't a backend so still no backends -> frontend warning fires.
    expect(issues.find((i) => i.code === 'NO_BACKEND_FOR_FRONTEND')).toBeTruthy();
  });

  it('drops containment edges from the adjacency map', () => {
    const issues = validateArchitecture(
      [node('vpc', 'Network.VPC', {}, 'container'), node('fe', 'Compute.StaticSite'), node('be', 'Compute.BackendAPI')],
      [edge('e1', 'vpc', 'fe', { relationship: 'contains' }), edge('e2', 'fe', 'be')],
      { mode: 'pre-deploy' },
    );
    expect(issues.find((i) => i.code === 'NO_BACKEND_FOR_FRONTEND')).toBeUndefined();
  });

  it('flags missing auth in production when backends exist', () => {
    const issues = validateArchitecture([node('be', 'Compute.BackendAPI')], [], {
      mode: 'pre-deploy',
      environment: 'production',
    });
    expect(issues.find((i) => i.code === 'NO_AUTH_PRODUCTION')?.severity).toBe('warning');
  });

  it('does not flag missing auth in non-production environments', () => {
    const issues = validateArchitecture([node('be', 'Compute.BackendAPI')], [], {
      mode: 'pre-deploy',
      environment: 'staging',
    });
    expect(issues.find((i) => i.code === 'NO_AUTH_PRODUCTION')).toBeUndefined();
  });

  it('does not flag missing auth when there are no backends', () => {
    const issues = validateArchitecture([node('fe', 'Compute.StaticSite')], [], {
      mode: 'pre-deploy',
      environment: 'production',
    });
    expect(issues.find((i) => i.code === 'NO_AUTH_PRODUCTION')).toBeUndefined();
  });

  it('does not flag missing auth when auth is present', () => {
    const issues = validateArchitecture([node('be', 'Compute.BackendAPI'), node('id', 'Security.Identity')], [], {
      mode: 'pre-deploy',
      environment: 'production',
    });
    expect(issues.find((i) => i.code === 'NO_AUTH_PRODUCTION')).toBeUndefined();
  });

  it('flags missing monitoring in production when backends or frontends exist', () => {
    const issues = validateArchitecture([node('fe', 'Compute.StaticSite')], [], {
      mode: 'pre-deploy',
      environment: 'production',
    });
    expect(issues.find((i) => i.code === 'NO_MONITORING')?.severity).toBe('info');
  });

  it('does not flag monitoring when monitoring is present', () => {
    const issues = validateArchitecture([node('be', 'Compute.BackendAPI'), node('log', 'Monitoring.Log')], [], {
      mode: 'pre-deploy',
      environment: 'production',
    });
    expect(issues.find((i) => i.code === 'NO_MONITORING')).toBeUndefined();
  });

  it('does not flag monitoring when no services exist', () => {
    const issues = validateArchitecture([node('db', 'Database.PostgreSQL')], [], {
      mode: 'pre-deploy',
      environment: 'production',
    });
    expect(issues.find((i) => i.code === 'NO_MONITORING')).toBeUndefined();
  });

  it('flags missing custom domain in production with frontends', () => {
    const issues = validateArchitecture([node('fe', 'Compute.StaticSite')], [], {
      mode: 'pre-deploy',
      environment: 'production',
    });
    expect(issues.find((i) => i.code === 'NO_SSL_PUBLIC')?.severity).toBe('info');
  });

  it('does not flag missing domain when a domain is present', () => {
    const issues = validateArchitecture([node('fe', 'Compute.StaticSite'), node('d', 'Network.PublicEndpoint')], [], {
      mode: 'pre-deploy',
      environment: 'production',
    });
    expect(issues.find((i) => i.code === 'NO_SSL_PUBLIC')).toBeUndefined();
  });

  it('does not flag missing domain when there are no frontends', () => {
    const issues = validateArchitecture([node('be', 'Compute.BackendAPI')], [], {
      mode: 'pre-deploy',
      environment: 'production',
    });
    expect(issues.find((i) => i.code === 'NO_SSL_PUBLIC')).toBeUndefined();
  });

  it('flags multiple databases without a cache', () => {
    const issues = validateArchitecture(
      [node('db1', 'Database.PostgreSQL'), node('db2', 'Database.MySQL'), node('be', 'Compute.BackendAPI')],
      [],
      { mode: 'pre-deploy' },
    );
    const r = issues.find((i) => i.code === 'MULTI_DB_NO_CACHE');
    expect(r?.severity).toBe('info');
    expect(r?.message).toContain('2 databases');
  });

  it('does not flag multi-db when a cache is present (Database.Redis counts as cache after findings #19)', () => {
    // findings.md #19 — the if/elseif order was changed so isCache runs
    // BEFORE isDatabase. Database.Redis matches both predicates, but now
    // lands in the caches bucket (which is what users mean when they
    // pick "Redis"). Two SQL databases + one Redis no longer trips
    // MULTI_DB_NO_CACHE.
    const issues = validateArchitecture(
      [
        node('db1', 'Database.PostgreSQL'),
        node('db2', 'Database.MySQL'),
        node('be', 'Compute.BackendAPI'),
        node('cache', 'Database.Redis'),
      ],
      [],
      { mode: 'pre-deploy' },
    );
    expect(issues.find((i) => i.code === 'MULTI_DB_NO_CACHE')).toBeUndefined();
  });

  it('does not flag multi-db when only one database exists', () => {
    const issues = validateArchitecture([node('db', 'Database.PostgreSQL'), node('be', 'Compute.BackendAPI')], [], {
      mode: 'pre-deploy',
    });
    expect(issues.find((i) => i.code === 'MULTI_DB_NO_CACHE')).toBeUndefined();
  });

  it('does not flag multi-db when no backend would be using the databases', () => {
    const issues = validateArchitecture([node('db1', 'Database.PostgreSQL'), node('db2', 'Database.MySQL')], [], {
      mode: 'pre-deploy',
    });
    expect(issues.find((i) => i.code === 'MULTI_DB_NO_CACHE')).toBeUndefined();
  });

  it('treats nodes without an iceType as untyped (no classification, no warnings)', () => {
    // Hits the `?? ''` fallback on the iceType lookup. Node ends up classified
    // as nothing (no isFrontend/isBackend/etc match).
    const issues = validateArchitecture([{ id: 'a', type: 'resource', data: {} }], [], { mode: 'pre-deploy' });
    expect(issues).toEqual([]);
  });

  it('reuses outgoing/incoming sets when multiple edges share an endpoint', () => {
    // First `if (!outgoing.has(e.source))` executes both arms — set creation
    // on first edge from 'fe', and the post-set branch on the second edge.
    // Same exercise for `incoming.has(e.target)` with two edges into 'be1'.
    const issues = validateArchitecture(
      [node('fe', 'Compute.StaticSite'), node('be1', 'Compute.BackendAPI'), node('be2', 'Compute.BackendAPI')],
      [edge('e1', 'fe', 'be1'), edge('e2', 'fe', 'be2'), edge('e3', 'be2', 'be1')],
      { mode: 'pre-deploy' },
    );
    expect(issues.find((i) => i.code === 'NO_BACKEND_FOR_FRONTEND')).toBeUndefined();
  });

  it('survives outgoing edges that point to nodes missing from nodeMap', () => {
    // Edge to a phantom node — the .some() callback short-circuits via the
    // `t &&` guard. No backend connection / no gateway connection found.
    const issues = validateArchitecture([node('fe', 'Compute.StaticSite')], [edge('e1', 'fe', 'phantom')], {
      mode: 'pre-deploy',
    });
    expect(issues.find((i) => i.code === 'NO_BACKEND_FOR_FRONTEND')).toBeTruthy();
  });

  it('handles a frontend with no outgoing edges (targets undefined)', () => {
    // Forces the `targets &&` guard to short-circuit on the false side.
    const issues = validateArchitecture(
      [
        node('fe', 'Compute.StaticSite'),
        node('be', 'Compute.BackendAPI'), // exists in graph but disconnected
      ],
      [],
      { mode: 'pre-deploy' },
    );
    // backends.length > 0, so the warning is suppressed regardless.
    expect(issues.find((i) => i.code === 'NO_BACKEND_FOR_FRONTEND')).toBeUndefined();
  });

  it('does not run production-only checks in non-production mode', () => {
    const issues = validateArchitecture(
      [node('fe', 'Compute.StaticSite'), node('be', 'Compute.BackendAPI')],
      [edge('e1', 'fe', 'be')],
      { mode: 'design' },
    );
    expect(issues.find((i) => i.code === 'NO_AUTH_PRODUCTION')).toBeUndefined();
    expect(issues.find((i) => i.code === 'NO_MONITORING')).toBeUndefined();
    expect(issues.find((i) => i.code === 'NO_SSL_PUBLIC')).toBeUndefined();
  });
});
