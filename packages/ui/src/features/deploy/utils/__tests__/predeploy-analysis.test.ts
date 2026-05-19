/**
 * Tests for analyzePreDeploy.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../security-rules', () => ({
  analyzeSecurityWarnings: vi.fn((nodes: any, edges: any) => {
    void nodes;
    void edges;
    return (analyzeSecurityWarnings as any)._return ?? [];
  }),
}));

import { analyzePreDeploy } from '../predeploy-analysis';
import { analyzeSecurityWarnings } from '../security-rules';
import type { CardNode, CardEdge } from '../../../../store/slices/cards-slice';

describe('analyzePreDeploy', () => {
  it('returns empty warnings + hasCritical=false when security check finds nothing', () => {
    (analyzeSecurityWarnings as any)._return = [];
    const out = analyzePreDeploy([] as CardNode[], [] as CardEdge[]);
    expect(out.warnings).toEqual([]);
    expect(out.hasCritical).toBe(false);
  });

  it('flags hasCritical when at least one warning is severity=critical', () => {
    (analyzeSecurityWarnings as any)._return = [
      { id: 'w1', severity: 'critical', message: 'unencrypted db' },
      { id: 'w2', severity: 'warning', message: 'public bucket' },
    ];
    const out = analyzePreDeploy([] as CardNode[], [] as CardEdge[]);
    expect(out.warnings).toHaveLength(2);
    expect(out.hasCritical).toBe(true);
  });

  it('hasCritical stays false when warnings exist but none are severity=critical', () => {
    (analyzeSecurityWarnings as any)._return = [
      { id: 'w1', severity: 'warning', message: 'public bucket' },
      { id: 'w2', severity: 'info', message: 'no monitoring' },
    ];
    const out = analyzePreDeploy([] as CardNode[], [] as CardEdge[]);
    expect(out.hasCritical).toBe(false);
  });

  it('passes nodes + edges through to analyzeSecurityWarnings', () => {
    (analyzeSecurityWarnings as any)._return = [];
    const nodes = [{ id: 'n1' }] as CardNode[];
    const edges = [{ id: 'e1' }] as CardEdge[];
    analyzePreDeploy(nodes, edges);
    expect(analyzeSecurityWarnings).toHaveBeenCalledWith(nodes, edges);
  });
});
