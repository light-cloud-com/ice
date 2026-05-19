/**
 * rf-canv-7 — pure cardinality regression for the special-connection util.
 *
 * `findExistingSpecialConnection` enforces the canvas rule that a service
 * node may have at most ONE `Source.Repository` connection AND at most ONE
 * `Config.Environment` connection. This file pins the verbatim behaviour
 * so the orchestrator's thin wrapper can keep delegating without drift:
 *
 *  - non-special drags (no Source.Repository / Config.Environment endpoint)
 *    return `{ specialType: null, conflict: false }`;
 *  - a second Source.Repository drag onto a service that already has one
 *    is a conflict — including via the `behavior === 'source'` alias;
 *  - a second Config.Environment drag onto a service that already has one
 *    is a conflict;
 *  - special-types are independent: a Source.Repository drag is fine even
 *    when the service already has a Config.Environment;
 *  - the rule is symmetric — drag direction does not matter (special →
 *    service vs service → special both detect the same conflict);
 *  - re-dragging an already-existing same-source-and-target edge still
 *    reports `conflict: true` because the existing edge IS itself a
 *    same-special-type connection to the service. The rule does not
 *    exclude the candidate from the lookup; this is the verbatim behaviour
 *    of the inline block lifted out of svg-canvas.tsx and is preserved
 *    intentionally.
 *
 * No React, no Redux — synthetic CanvasNode arrays + plain edge tuples.
 */

import { describe, it, expect } from 'vitest';
import { findExistingLogSource, findExistingSpecialConnection } from '../connection-special-rules';
import type { CanvasNode } from '../../components/types';

/** Minimal CanvasNode factory — only the fields the rule reads. */
function node(id: string, iceType: string, extraData: Record<string, unknown> = {}): CanvasNode {
  return {
    id,
    type: 'block',
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    label: id,
    data: { iceType, ...extraData },
  };
}

describe('findExistingSpecialConnection', () => {
  it('returns null/false when neither endpoint is a special block', () => {
    const src = node('svc-a', 'Compute.Service');
    const tgt = node('db-a', 'Database.Postgres');
    const result = findExistingSpecialConnection(src, tgt, [], [src, tgt]);
    expect(result).toEqual({ specialType: null, conflict: false });
  });

  it('returns null/false when neither endpoint is special, even with edges in the canvas', () => {
    const src = node('svc-a', 'Compute.Service');
    const tgt = node('db-a', 'Database.Postgres');
    const repo = node('repo-a', 'Source.Repository');
    // The service has a Source.Repository, but THIS drag does not involve a
    // special block — so the rule should not fire.
    const edges = [{ source: 'repo-a', target: 'svc-a' }];
    const result = findExistingSpecialConnection(src, tgt, edges, [src, tgt, repo]);
    expect(result).toEqual({ specialType: null, conflict: false });
  });

  it('flags a conflict when a service already has a Source.Repository (special → service drag)', () => {
    const repoExisting = node('repo-a', 'Source.Repository');
    const repoNew = node('repo-b', 'Source.Repository');
    const svc = node('svc-a', 'Compute.Service');
    const edges = [{ source: 'repo-a', target: 'svc-a' }];
    const result = findExistingSpecialConnection(repoNew, svc, edges, [repoExisting, repoNew, svc]);
    expect(result).toEqual({ specialType: 'source', conflict: true });
  });

  it('flags a conflict when a service already has a Config.Environment (special → service drag)', () => {
    const envExisting = node('env-a', 'Config.Environment');
    const envNew = node('env-b', 'Config.Environment');
    const svc = node('svc-a', 'Compute.Service');
    const edges = [{ source: 'env-a', target: 'svc-a' }];
    const result = findExistingSpecialConnection(envNew, svc, edges, [envExisting, envNew, svc]);
    expect(result).toEqual({ specialType: 'config', conflict: true });
  });

  it('does NOT flag a conflict when the special types differ (Source attempt with existing Config)', () => {
    const repoNew = node('repo-b', 'Source.Repository');
    const envExisting = node('env-a', 'Config.Environment');
    const svc = node('svc-a', 'Compute.Service');
    const edges = [{ source: 'env-a', target: 'svc-a' }];
    const result = findExistingSpecialConnection(repoNew, svc, edges, [repoNew, envExisting, svc]);
    expect(result).toEqual({ specialType: 'source', conflict: false });
  });

  it('detects the conflict symmetrically when the user drags from service → special', () => {
    const repoExisting = node('repo-a', 'Source.Repository');
    const repoNew = node('repo-b', 'Source.Repository');
    const svc = node('svc-a', 'Compute.Service');
    const edges = [{ source: 'svc-a', target: 'repo-a' }];
    // Drag direction reversed: source IS the service, target IS the new repo.
    const result = findExistingSpecialConnection(svc, repoNew, edges, [repoExisting, repoNew, svc]);
    expect(result).toEqual({ specialType: 'source', conflict: true });
  });

  it('treats data.behavior === "source" as a Source.Repository for the rule', () => {
    // Some blocks (e.g. Concept blocks) signal "this is a repo-like source"
    // via data.behavior rather than iceType — the rule covers that alias.
    const aliasRepo = node('alias-a', 'Concept.SomeRepoLike', { behavior: 'source' });
    const newRepo = node('repo-b', 'Source.Repository');
    const svc = node('svc-a', 'Compute.Service');
    const edges = [{ source: 'alias-a', target: 'svc-a' }];
    const result = findExistingSpecialConnection(newRepo, svc, edges, [aliasRepo, newRepo, svc]);
    expect(result).toEqual({ specialType: 'source', conflict: true });
  });

  it('preserves verbatim behaviour: redrawing an already-existing edge still reports conflict', () => {
    // This pins behaviour, not aspiration: the inline block lifted out of
    // svg-canvas.tsx does not exclude the candidate from the lookup, so an
    // attempt to recreate the same edge still matches itself as the
    // "existing" special connection. Documented for the next refactorer.
    const repo = node('repo-a', 'Source.Repository');
    const svc = node('svc-a', 'Compute.Service');
    const edges = [{ source: 'repo-a', target: 'svc-a' }];
    const result = findExistingSpecialConnection(repo, svc, edges, [repo, svc]);
    expect(result).toEqual({ specialType: 'source', conflict: true });
  });

  it('ignores edges that are unrelated to the service node', () => {
    // The service has no special connections; another service does.
    // The rule must not pollute across services.
    const svcA = node('svc-a', 'Compute.Service');
    const svcB = node('svc-b', 'Compute.Service');
    const repoForB = node('repo-b', 'Source.Repository');
    const repoNew = node('repo-a', 'Source.Repository');
    const edges = [{ source: 'repo-b', target: 'svc-b' }];
    const result = findExistingSpecialConnection(repoNew, svcA, edges, [svcA, svcB, repoForB, repoNew]);
    expect(result).toEqual({ specialType: 'source', conflict: false });
  });

  it('skips edges whose other endpoint cannot be resolved in the nodes array', () => {
    // Defensive: a stale edge referencing a deleted node should not crash
    // and should not count as a conflict.
    const repoNew = node('repo-b', 'Source.Repository');
    const svc = node('svc-a', 'Compute.Service');
    const edges = [{ source: 'ghost-id', target: 'svc-a' }];
    const result = findExistingSpecialConnection(repoNew, svc, edges, [repoNew, svc]);
    expect(result).toEqual({ specialType: 'source', conflict: false });
  });

  it('matches Config.Environment against an existing Config.Environment regardless of edge direction', () => {
    const envA = node('env-a', 'Config.Environment');
    const envNew = node('env-b', 'Config.Environment');
    const svc = node('svc-a', 'Compute.Service');
    // Existing edge is service→env (service was the source).
    const edges = [{ source: 'svc-a', target: 'env-a' }];
    const result = findExistingSpecialConnection(envNew, svc, edges, [envA, envNew, svc]);
    expect(result).toEqual({ specialType: 'config', conflict: true });
  });

  it('detects Config.Environment as target endpoint when source is the service (symmetric drag)', () => {
    // Service → Config.Environment drag. Pins the `tgtType === 'Config.Environment'`
    // ternary branch in `fullSpecialType` resolution.
    const envExisting = node('env-a', 'Config.Environment');
    const envNew = node('env-b', 'Config.Environment');
    const svc = node('svc-a', 'Compute.Service');
    const edges = [{ source: 'svc-a', target: 'env-a' }];
    const result = findExistingSpecialConnection(svc, envNew, edges, [envExisting, envNew, svc]);
    expect(result).toEqual({ specialType: 'config', conflict: true });
  });

  it('returns specialType=null when iceType is missing on both endpoints', () => {
    // Defensive: a malformed node (no `data.iceType`) should not crash and
    // should not be classified as special. Pins the `|| ''` fallback branch.
    const malformedSrc: CanvasNode = {
      id: 'mal-src',
      type: 'block',
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      label: 'mal-src',
      data: {},
    };
    const malformedTgt: CanvasNode = { ...malformedSrc, id: 'mal-tgt' };
    const result = findExistingSpecialConnection(malformedSrc, malformedTgt, [], [malformedSrc, malformedTgt]);
    expect(result).toEqual({ specialType: null, conflict: false });
  });

  it('skips an edge whose other endpoint has no iceType when looking for special-type matches', () => {
    // A stray edge connects the service to a node with no iceType. The rule
    // should not count that as a same-special-type match. Pins the
    // `(otherNode.data?.iceType as string) || ''` fallback branch on line 88.
    const repoNew = node('repo-b', 'Source.Repository');
    const svc = node('svc-a', 'Compute.Service');
    const malformedOther: CanvasNode = {
      id: 'mal-other',
      type: 'block',
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      label: 'mal-other',
      data: {},
    };
    const edges = [{ source: 'mal-other', target: 'svc-a' }];
    const result = findExistingSpecialConnection(repoNew, svc, edges, [repoNew, svc, malformedOther]);
    expect(result).toEqual({ specialType: 'source', conflict: false });
  });
});

describe('findExistingLogSource', () => {
  it('returns conflict:false when neither endpoint is a log terminal', () => {
    const a = node('svc-a', 'Compute.Service');
    const b = node('db-a', 'Database.PostgreSQL');
    expect(findExistingLogSource(a, b, [])).toEqual({ conflict: false });
  });

  it('returns conflict:false on the first inbound edge to a log terminal', () => {
    const svc = node('svc-a', 'Compute.Service');
    const log = node('log-a', 'Monitoring.Log');
    expect(findExistingLogSource(svc, log, [])).toEqual({ conflict: false });
  });

  it('returns conflict:true on a second inbound edge to a log terminal', () => {
    const svcA = node('svc-a', 'Compute.Service');
    const svcB = node('svc-b', 'Compute.Service');
    const log = node('log-a', 'Monitoring.Log');
    expect(findExistingLogSource(svcB, log, [{ source: 'svc-a', target: 'log-a' }])).toEqual({ conflict: true });
  });

  it('detects conflict in either drag direction (log → service or service → log)', () => {
    const svc = node('svc-b', 'Compute.Service');
    const log = node('log-a', 'Monitoring.Log');
    expect(findExistingLogSource(log, svc, [{ source: 'svc-a', target: 'log-a' }])).toEqual({ conflict: true });
  });

  it('matches the Observability.Logs iceType as a log terminal', () => {
    const svc = node('svc-a', 'Compute.Service');
    const log = node('log-a', 'Observability.Logs');
    expect(findExistingLogSource(svc, log, [{ source: 'svc-b', target: 'log-a' }])).toEqual({ conflict: true });
  });

  it('matches any Log.* iceType as a log terminal', () => {
    const svc = node('svc-a', 'Compute.Service');
    const log = node('log-a', 'Log.Stream');
    expect(findExistingLogSource(svc, log, [{ source: 'svc-b', target: 'log-a' }])).toEqual({ conflict: true });
  });
});
