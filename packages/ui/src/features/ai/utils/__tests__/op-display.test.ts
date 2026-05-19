/**
 * rf-aichat-2 — opSummary + opBadgeColor display helpers.
 *
 * Pure switch/branching code — every case from the discriminated union plus
 * the default arm needs an arm-test for full branch coverage.
 */

import { describe, it, expect } from 'vitest';
import { opSummary, opBadgeColor } from '../op-display';
import type { AiCanvasOp } from '@ice/types';

// ─── opSummary ─────────────────────────────────────────────────────────────

describe('opSummary', () => {
  it('addBlueprint with label → "Add <label>"', () => {
    const op: AiCanvasOp = { op: 'addBlueprint', iceType: 'Database.PostgreSQL', label: 'My DB' };
    expect(opSummary(op)).toBe('Add My DB');
  });

  it('addBlueprint without label → falls back to iceType', () => {
    const op: AiCanvasOp = { op: 'addBlueprint', iceType: 'Database.PostgreSQL' };
    expect(opSummary(op)).toBe('Add Database.PostgreSQL');
  });

  it('addNode with data.label → "Add <label>"', () => {
    const op: AiCanvasOp = {
      op: 'addNode',
      node: {
        id: 'n1',
        type: 'block',
        position: { x: 0, y: 0 },
        data: { label: 'Friendly Name' },
      },
    };
    expect(opSummary(op)).toBe('Add Friendly Name');
  });

  it('addNode without data.label → falls back to node.type', () => {
    const op: AiCanvasOp = {
      op: 'addNode',
      node: {
        id: 'n1',
        type: 'resource',
        position: { x: 0, y: 0 },
        data: {},
      },
    };
    expect(opSummary(op)).toBe('Add resource');
  });

  it('addEdge → "Connect <source> → <target>"', () => {
    const op: AiCanvasOp = {
      op: 'addEdge',
      edge: { id: 'e1', source: 'a', target: 'b' },
    };
    expect(opSummary(op)).toBe('Connect a → b');
  });

  it('updateNodeData → "Update <nodeId>"', () => {
    const op: AiCanvasOp = { op: 'updateNodeData', nodeId: 'node-x', data: {} };
    expect(opSummary(op)).toBe('Update node-x');
  });

  it('deleteNode → "Remove <nodeId>"', () => {
    const op: AiCanvasOp = { op: 'deleteNode', nodeId: 'node-y' };
    expect(opSummary(op)).toBe('Remove node-y');
  });

  it('deleteEdge → "Remove connection"', () => {
    const op: AiCanvasOp = { op: 'deleteEdge', edgeId: 'e9' };
    expect(opSummary(op)).toBe('Remove connection');
  });

  it('autoOrganize → "Reorganize layout"', () => {
    const op: AiCanvasOp = { op: 'autoOrganize' };
    expect(opSummary(op)).toBe('Reorganize layout');
  });

  it('default arm: returns the bare op name for unknown / non-default-arm shapes', () => {
    // updateNodePosition is part of the union but not a switch arm — must hit default.
    const op: AiCanvasOp = { op: 'updateNodePosition', nodeId: 'n', x: 0, y: 0 };
    expect(opSummary(op)).toBe('updateNodePosition');
  });

  it('default arm: resizeNode also routes to default', () => {
    const op: AiCanvasOp = { op: 'resizeNode', id: 'n', width: 100, height: 60 };
    expect(opSummary(op)).toBe('resizeNode');
  });

  it('default arm: reparentNode also routes to default', () => {
    const op: AiCanvasOp = { op: 'reparentNode', nodeId: 'n', parentId: null };
    expect(opSummary(op)).toBe('reparentNode');
  });

  it('default arm: updateEdgeData also routes to default', () => {
    const op: AiCanvasOp = { op: 'updateEdgeData', edgeId: 'e', data: {} };
    expect(opSummary(op)).toBe('updateEdgeData');
  });
});

// ─── opBadgeColor ──────────────────────────────────────────────────────────

describe('opBadgeColor', () => {
  it('delete-prefixed ops → red bucket', () => {
    expect(opBadgeColor({ op: 'deleteNode', nodeId: 'x' })).toBe('bg-red-500/20 text-red-400');
    expect(opBadgeColor({ op: 'deleteEdge', edgeId: 'x' })).toBe('bg-red-500/20 text-red-400');
  });

  it('add-prefixed ops → emerald bucket', () => {
    expect(
      opBadgeColor({
        op: 'addNode',
        node: { id: 'n1', type: 'block', position: { x: 0, y: 0 }, data: {} },
      }),
    ).toBe('bg-emerald-500/20 text-emerald-400');
    expect(
      opBadgeColor({ op: 'addEdge', edge: { id: 'e', source: 'a', target: 'b' } }),
    ).toBe('bg-emerald-500/20 text-emerald-400');
    expect(opBadgeColor({ op: 'addBlueprint', iceType: 'X' })).toBe(
      'bg-emerald-500/20 text-emerald-400',
    );
  });

  it('non-add / non-delete ops → blue bucket', () => {
    expect(opBadgeColor({ op: 'updateNodeData', nodeId: 'x', data: {} })).toBe(
      'bg-blue-500/20 text-blue-400',
    );
    expect(opBadgeColor({ op: 'autoOrganize' })).toBe('bg-blue-500/20 text-blue-400');
    expect(opBadgeColor({ op: 'updateNodePosition', nodeId: 'n', x: 0, y: 0 })).toBe(
      'bg-blue-500/20 text-blue-400',
    );
    expect(opBadgeColor({ op: 'resizeNode', id: 'n', width: 1, height: 1 })).toBe(
      'bg-blue-500/20 text-blue-400',
    );
    expect(opBadgeColor({ op: 'reparentNode', nodeId: 'n', parentId: null })).toBe(
      'bg-blue-500/20 text-blue-400',
    );
    expect(opBadgeColor({ op: 'updateEdgeData', edgeId: 'e', data: {} })).toBe(
      'bg-blue-500/20 text-blue-400',
    );
  });

  it('delete-bucket takes precedence — even though no real op starts with both, the order is observable', () => {
    // Synthetic future-proofing: an op whose name happens to start with "delete"
    // must always land red regardless of any later substrings.
    const op = { op: 'deleteAndAddSomething' } as unknown as AiCanvasOp;
    expect(opBadgeColor(op)).toBe('bg-red-500/20 text-red-400');
  });
});
