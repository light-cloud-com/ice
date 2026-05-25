import { describe, expect, it } from 'vitest';
import { inferEdgePorts } from '../infer';
import { getPortsForNode } from '../derive';

function node(iceType: string, extra: Record<string, unknown> = {}) {
  return { id: 't', data: { iceType, ...extra } };
}

describe('inferEdgePorts — render-time fallback for legacy edges', () => {
  it('Repo → Frontend infers repository-out / repository-in', () => {
    const src = getPortsForNode(node('Source.Repository'));
    const tgt = getPortsForNode(node('Compute.StaticSite'));
    const { sourcePort, targetPort } = inferEdgePorts(src, tgt, 'pipeline');
    expect(sourcePort?.id).toBe('repository-out');
    expect(targetPort?.id).toBe('repository-in');
  });

  it('CustomDomain → Frontend infers domain-out / domain-in', () => {
    const src = getPortsForNode(node('Network.CustomDomain'));
    const tgt = getPortsForNode(node('Compute.StaticSite'));
    const { sourcePort, targetPort } = inferEdgePorts(src, tgt, 'dns');
    expect(sourcePort?.id).toBe('domain-out');
    expect(targetPort?.id).toBe('domain-in');
  });

  it('Postgres → Backend infers db-out / db-in', () => {
    const src = getPortsForNode(node('Database.PostgreSQL'));
    const tgt = getPortsForNode(node('Compute.Container'));
    const { sourcePort, targetPort } = inferEdgePorts(src, tgt, 'traffic');
    expect(sourcePort?.id).toBe('db-out');
    expect(targetPort?.id).toBe('db-in');
  });

  it('Service → Monitoring infers logs-out / logs-in', () => {
    const src = getPortsForNode(node('Compute.Container'));
    const tgt = getPortsForNode(node('Monitoring.Log'));
    const { sourcePort, targetPort } = inferEdgePorts(src, tgt, 'traffic');
    expect(sourcePort?.id).toBe('logs-out');
    expect(targetPort?.id).toBe('logs-in');
  });

  it('returns undefined when no pair is compatible', () => {
    // Custom Domain has only domain-out, Postgres has only db-out — no IN port matches.
    const src = getPortsForNode(node('Network.CustomDomain'));
    const tgt = getPortsForNode(node('Database.PostgreSQL'));
    const { sourcePort, targetPort } = inferEdgePorts(src, tgt, 'dns');
    expect(sourcePort).toBeUndefined();
    expect(targetPort).toBeUndefined();
  });

  it('ignores reroute (`any`) when a concrete role match exists', () => {
    // If a Reroute is in the source list, its 'any' OUT shouldn't outscore
    // a real role match.
    const rerouteOut = getPortsForNode(node('Util.Reroute')).find((p) => p.direction === 'out')!;
    const repoOut = getPortsForNode(node('Source.Repository'))[0];
    const tgt = getPortsForNode(node('Compute.StaticSite'));
    const { sourcePort } = inferEdgePorts([rerouteOut, repoOut], tgt, 'pipeline');
    expect(sourcePort?.id).toBe('repository-out');
  });
});
