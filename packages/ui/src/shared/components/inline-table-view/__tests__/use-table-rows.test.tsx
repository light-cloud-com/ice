/**
 * Tests for `inline-table-view/use-table-rows.ts` (rf-itab-3). Uses
 * the capture-ref probe pattern — no jsdom; we directly invoke the
 * hook via a Probe FC and walk the result.
 */
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../assets/icons/service-names', () => ({
  getServiceName: (iceType: string) => iceType.split('.').pop() || '',
}));

vi.mock('../../inline-table-view-helpers', () => ({
  buildEndpoints: () => [],
  deriveStatus: (node: any) => (node.data?.status as string | undefined) || 'idle',
  providerLabel: (p: string) => p.toUpperCase(),
}));

import { useTableRows, type UseTableRowsInput, type UseTableRowsResult } from '../use-table-rows';

let captured: UseTableRowsResult | null = null;

function Probe(props: UseTableRowsInput) {
  captured = useTableRows(props);
  return null;
}

function callHook(input: UseTableRowsInput): UseTableRowsResult {
  captured = null;
  renderToStaticMarkup(createElement(Probe as any, input));
  if (!captured) throw new Error('Probe did not capture useTableRows result');
  return captured;
}

const baseInput: UseTableRowsInput = {
  activeCard: { nodes: [] },
  deployedResources: [],
  driftByNode: {},
  nodePipelineStatus: {},
  search: '',
  sortCol: 'label',
  sortDir: 'asc',
  statusFilter: new Set(),
  providerFilter: new Set(),
  groupBy: 'none',
  t: (k) => k,
};

function makeNode(id: string, data: Record<string, any> = {}, parentId?: string) {
  return { id, type: 'gcp.run.service', data: { provider: 'gcp', ...data }, parentId };
}

describe('inline-table-view/use-table-rows', () => {
  describe('rows', () => {
    it('returns empty array when activeCard has no nodes', () => {
      const r = callHook({ ...baseInput, activeCard: undefined });
      expect(r.rows).toEqual([]);
    });

    it('returns empty array when activeCard.nodes is empty', () => {
      const r = callHook({ ...baseInput, activeCard: { nodes: [] } });
      expect(r.rows).toEqual([]);
    });

    it('builds one row per node', () => {
      const r = callHook({
        ...baseInput,
        activeCard: { nodes: [makeNode('n1', { label: 'Node 1' }), makeNode('n2', { label: 'Node 2' })] },
      });
      expect(r.rows).toHaveLength(2);
      expect(r.rows[0]!.label).toBe('Node 1');
      expect(r.rows[1]!.label).toBe('Node 2');
    });

    it('falls back to typeLabel when label/name/title are missing', () => {
      const r = callHook({
        ...baseInput,
        activeCard: { nodes: [makeNode('n1')] },
      });
      expect(r.rows[0]!.label).toBe('service'); // service-name mock returns last segment
    });

    it('falls back to node id when even typeLabel is empty', () => {
      const r = callHook({
        ...baseInput,
        activeCard: { nodes: [{ id: 'n1', type: '', data: { provider: '' } }] },
      });
      expect(r.rows[0]!.label).toBe('n1');
    });

    it('flags isChild when node has a parentId', () => {
      const r = callHook({
        ...baseInput,
        activeCard: { nodes: [makeNode('n1', {}, 'parent-1')] },
      });
      expect(r.rows[0]!.isChild).toBe(true);
    });
  });

  describe('filtered + sorted', () => {
    it('returns sorted by label asc when no filters active', () => {
      const r = callHook({
        ...baseInput,
        activeCard: {
          nodes: [makeNode('n1', { label: 'Charlie' }), makeNode('n2', { label: 'Alice' }), makeNode('n3', { label: 'Bob' })],
        },
      });
      expect(r.sorted.map((row) => row.label)).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('sorts by label desc', () => {
      const r = callHook({
        ...baseInput,
        sortDir: 'desc',
        activeCard: {
          nodes: [makeNode('n1', { label: 'Charlie' }), makeNode('n2', { label: 'Alice' }), makeNode('n3', { label: 'Bob' })],
        },
      });
      expect(r.sorted.map((row) => row.label)).toEqual(['Charlie', 'Bob', 'Alice']);
    });

    it('filters by status', () => {
      const r = callHook({
        ...baseInput,
        statusFilter: new Set(['failed']),
        activeCard: {
          nodes: [
            makeNode('n1', { label: 'A', status: 'idle' }),
            makeNode('n2', { label: 'B', status: 'failed' }),
            makeNode('n3', { label: 'C', status: 'failed' }),
          ],
        },
      });
      expect(r.sorted.map((row) => row.label)).toEqual(['B', 'C']);
    });

    it('filters by provider', () => {
      const r = callHook({
        ...baseInput,
        providerFilter: new Set(['aws']),
        activeCard: {
          nodes: [
            { id: 'n1', type: 't', data: { label: 'A', provider: 'gcp' } },
            { id: 'n2', type: 't', data: { label: 'B', provider: 'aws' } },
          ],
        },
      });
      expect(r.sorted.map((row) => row.label)).toEqual(['B']);
    });

    it('filters by free-text search across multiple fields', () => {
      const r = callHook({
        ...baseInput,
        search: 'Production',
        activeCard: {
          nodes: [makeNode('n1', { label: 'Production API' }), makeNode('n2', { label: 'Dev API' })],
        },
      });
      expect(r.sorted.map((row) => row.label)).toEqual(['Production API']);
    });
  });

  describe('grouped', () => {
    it('returns single _all group when groupBy === none', () => {
      const r = callHook({
        ...baseInput,
        activeCard: { nodes: [makeNode('n1'), makeNode('n2')] },
      });
      expect(r.grouped).toHaveLength(1);
      expect(r.grouped[0]!.key).toBe('_all');
    });

    it('groups by status when groupBy === status', () => {
      const r = callHook({
        ...baseInput,
        groupBy: 'status',
        activeCard: {
          nodes: [
            makeNode('n1', { status: 'live' }),
            makeNode('n2', { status: 'failed' }),
            makeNode('n3', { status: 'live' }),
          ],
        },
      });
      const keys = r.grouped.map((g) => g.key).sort();
      expect(keys).toEqual(['failed', 'live']);
    });

    it('groups by provider when groupBy === provider', () => {
      const r = callHook({
        ...baseInput,
        groupBy: 'provider',
        activeCard: {
          nodes: [
            { id: 'n1', type: 't', data: { provider: 'gcp' } },
            { id: 'n2', type: 't', data: { provider: 'aws' } },
            { id: 'n3', type: 't', data: { provider: 'gcp' } },
          ],
        },
      });
      const keys = r.grouped.map((g) => g.key).sort();
      expect(keys).toEqual(['aws', 'gcp']);
    });

    it('groups by family (first segment of iceType)', () => {
      const r = callHook({
        ...baseInput,
        groupBy: 'family',
        activeCard: {
          nodes: [
            { id: 'n1', type: 't', data: { iceType: 'gcp.run.service', provider: 'gcp' } },
            { id: 'n2', type: 't', data: { iceType: 'aws.lambda.function', provider: 'aws' } },
          ],
        },
      });
      const keys = r.grouped.map((g) => g.key).sort();
      expect(keys).toEqual(['aws', 'gcp']);
    });

    it('uses _root key for top-level nodes when grouping by group', () => {
      const r = callHook({
        ...baseInput,
        groupBy: 'group',
        activeCard: {
          nodes: [makeNode('n1', {}, undefined), makeNode('n2', {}, 'parent-1')],
        },
      });
      const keys = r.grouped.map((g) => g.key).sort();
      expect(keys).toEqual(['_root', 'parent-1']);
    });
  });

  describe('counts', () => {
    it('counts each status', () => {
      const r = callHook({
        ...baseInput,
        activeCard: {
          nodes: [
            makeNode('n1', { status: 'live' }),
            makeNode('n2', { status: 'live' }),
            makeNode('n3', { status: 'failed' }),
            makeNode('n4', { status: 'idle' }),
          ],
        },
      });
      expect(r.counts.live).toBe(2);
      expect(r.counts.failed).toBe(1);
      expect(r.counts.idle).toBe(1);
      expect(r.counts.queued).toBe(0);
    });

    it('returns zeros across all statuses when there are no rows', () => {
      const r = callHook({ ...baseInput, activeCard: { nodes: [] } });
      expect(Object.values(r.counts).every((c) => c === 0)).toBe(true);
    });
  });

  describe('availableProviders', () => {
    it('returns the unique sorted list of providers', () => {
      const r = callHook({
        ...baseInput,
        activeCard: {
          nodes: [
            { id: 'n1', type: 't', data: { provider: 'gcp' } },
            { id: 'n2', type: 't', data: { provider: 'aws' } },
            { id: 'n3', type: 't', data: { provider: 'gcp' } },
            { id: 'n4', type: 't', data: { provider: 'azure' } },
          ],
        },
      });
      expect(r.availableProviders).toEqual(['aws', 'azure', 'gcp']);
    });

    it('skips empty provider entries', () => {
      const r = callHook({
        ...baseInput,
        activeCard: {
          nodes: [
            { id: 'n1', type: 't', data: { provider: 'gcp' } },
            { id: 'n2', type: 't', data: { provider: '' } },
          ],
        },
      });
      expect(r.availableProviders).toEqual(['gcp']);
    });
  });
});
