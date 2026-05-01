/**
 * Types and constants for auto-layout. Pinning the visual-size constants to
 * their exact values guards the renderer-mirror invariant: any future drift
 * from `features/canvas/components/nodes/*` compute formulas must update both
 * sides in lockstep.
 */

import { describe, it, expect } from 'vitest';
import {
  CD_EXTRA_WIDTH,
  CD_HEADER_HEIGHT,
  CD_DOMAIN_FIELD_HEIGHT,
  CD_ROUTE_ROW_HEIGHT,
  CD_ROUTE_ROW_GAP,
  CD_PADDING,
  CD_ADD_BUTTON_HEIGHT,
  MQ_HEADER_HEIGHT,
  MQ_ROW_HEIGHT,
  MQ_ROW_GAP,
  MQ_PADDING,
  SS_HEADER_HEIGHT,
  SS_ROW_HEIGHT,
  SS_PADDING,
  EC_HEADER_HEIGHT,
  EC_ROW_HEIGHT,
  EC_PADDING,
  ES_HEADER_HEIGHT,
  ES_FIELD_HEIGHT,
  ES_PADDING,
  DEFAULT_OPTIONS,
  type LayoutNode,
  type LayoutEdge,
  type Point,
  type LayoutResult,
  type LayoutOptions,
} from '../types';

describe('auto-layout/types — visual-size constants', () => {
  it('Custom Domain dimensions are pinned', () => {
    expect(CD_EXTRA_WIDTH).toBe(40);
    expect(CD_HEADER_HEIGHT).toBe(48);
    expect(CD_DOMAIN_FIELD_HEIGHT).toBe(38);
    expect(CD_ROUTE_ROW_HEIGHT).toBe(36);
    expect(CD_ROUTE_ROW_GAP).toBe(4);
    expect(CD_PADDING).toBe(10);
    expect(CD_ADD_BUTTON_HEIGHT).toBe(32);
  });

  it('Message Queue dimensions are pinned', () => {
    expect(MQ_HEADER_HEIGHT).toBe(48);
    expect(MQ_ROW_HEIGHT).toBe(26);
    expect(MQ_ROW_GAP).toBe(4);
    expect(MQ_PADDING).toBe(12);
  });

  it('Secret Store dimensions are pinned', () => {
    expect(SS_HEADER_HEIGHT).toBe(48);
    expect(SS_ROW_HEIGHT).toBe(20);
    expect(SS_PADDING).toBe(12);
  });

  it('Env Config dimensions are pinned', () => {
    expect(EC_HEADER_HEIGHT).toBe(48);
    expect(EC_ROW_HEIGHT).toBe(20);
    expect(EC_PADDING).toBe(12);
  });

  it('Email Service dimensions are pinned', () => {
    expect(ES_HEADER_HEIGHT).toBe(48);
    expect(ES_FIELD_HEIGHT).toBe(30);
    expect(ES_PADDING).toBe(12);
  });
});

describe('auto-layout/types — DEFAULT_OPTIONS', () => {
  it('exports a fully-saturated Required<LayoutOptions> shape', () => {
    expect(DEFAULT_OPTIONS).toEqual({
      startX: 50,
      startY: 50,
      nodeGap: expect.any(Number),
      nodesPerRow: 3,
      containerPadding: expect.any(Number),
      layout: 'flow',
      direction: 'vertical',
      zoom: 1,
    });
  });

  it('layout defaults to flow (dagre tree path)', () => {
    expect(DEFAULT_OPTIONS.layout).toBe('flow');
  });

  it('direction defaults to vertical (rankdir TB)', () => {
    expect(DEFAULT_OPTIONS.direction).toBe('vertical');
  });

  it('zoom defaults to 1 (identity scale)', () => {
    expect(DEFAULT_OPTIONS.zoom).toBe(1);
  });
});

describe('auto-layout/types — type shapes', () => {
  it('LayoutNode accepts the full structural shape', () => {
    const n: LayoutNode = {
      id: 'a',
      type: 'resource',
      iceType: 'Compute.Container',
      label: 'A',
      parentId: null,
      width: 240,
      height: 160,
      x: 0,
      y: 0,
      data: {},
    };
    expect(n.id).toBe('a');
  });

  it('LayoutNode allows optional children + folded', () => {
    const n: LayoutNode = {
      id: 'p',
      type: 'container',
      iceType: 'Group.Custom',
      label: 'P',
      width: 400,
      height: 300,
      x: 0,
      y: 0,
      data: {},
      children: [],
      folded: false,
    };
    expect(n.children).toEqual([]);
    expect(n.folded).toBe(false);
  });

  it('LayoutEdge accepts an optional relationship', () => {
    const e1: LayoutEdge = { source: 'a', target: 'b' };
    const e2: LayoutEdge = { source: 'a', target: 'b', relationship: 'connects_to' };
    expect(e1.relationship).toBeUndefined();
    expect(e2.relationship).toBe('connects_to');
  });

  it('Point is a flat {x, y}', () => {
    const p: Point = { x: 10, y: 20 };
    expect(p).toEqual({ x: 10, y: 20 });
  });

  it('LayoutResult holds nodes + a Map of edge routes', () => {
    const r: LayoutResult = { nodes: [], edgeRoutes: new Map() };
    expect(r.nodes).toEqual([]);
    expect(r.edgeRoutes).toBeInstanceOf(Map);
  });

  it('LayoutOptions accepts every option as optional', () => {
    const o1: LayoutOptions = {};
    const o2: LayoutOptions = {
      startX: 0,
      startY: 0,
      nodeGap: 50,
      nodesPerRow: 4,
      containerPadding: 20,
      layout: 'circular',
      direction: 'horizontal',
      zoom: 2,
    };
    expect(o1).toEqual({});
    expect(o2.layout).toBe('circular');
  });
});
