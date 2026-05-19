/**
 * PropertiesPanel — orchestrator that picks a subview based on selection.
 *
 * Direct-FC tree-walker. We stub the three subviews + the selectActiveCard
 * selector + useResourceMap/usePropertyIssues hooks. Each subview stub has
 * a `displayName` so we can identify which one was chosen by inspecting
 * the returned element's `type.displayName`.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const make = (name: string) => {
    const fc = ((p: Record<string, unknown>) => ({ type: 'div', props: p })) as unknown as React.FC;
    (fc as { displayName?: string }).displayName = name;
    return fc;
  };
  return {
    state: {
      selection: { selectedNodes: [] as string[], selectedEdges: [] as string[] },
      validation: { issues: [] as unknown[] } as { issues: unknown[] } | undefined,
      environments: {
        activeEnvId: {} as Record<string, string | undefined>,
        byProject: {} as Record<string, { id: string; name: string }[] | undefined>,
      },
    },
    activeCard: null as null | {
      id: string;
      nodes: Array<{ id: string; data?: Record<string, unknown> }>;
      edges: Array<{ id: string; source: string; target: string }>;
      projectId?: string;
    },
    EdgeStub: make('EdgePropertiesSection'),
    NodeStub: make('NodePropertiesSection'),
    OverviewStub: make('ProjectOverview'),
  };
});

vi.mock('react', async (orig) => {
  const actual = (await orig()) as typeof import('react');
  const useMemo = vi.fn(<T,>(fn: () => T): T => fn());
  const useState = vi.fn(<T,>(init: T): [T, (v: T) => void] => [init, vi.fn()]);
  const def = (actual as unknown as { default?: typeof actual }).default ?? actual;
  return { ...actual, useMemo, useState, default: { ...def, useMemo, useState } };
});

vi.mock('react-redux', () => ({
  useSelector: (sel: (s: unknown) => unknown) => sel(mocks.state),
}));

vi.mock('../../../../store/slices/cards-slice', () => ({
  selectActiveCard: () => mocks.activeCard,
}));

vi.mock('../../hooks/use-resource-map', () => ({
  useResourceMap: () => ({}),
  usePropertyIssues: () => new Map(),
}));

vi.mock('../sections/edge-properties-section', () => ({ EdgePropertiesSection: mocks.EdgeStub }));
vi.mock('../sections/node-properties-section', () => ({ NodePropertiesSection: mocks.NodeStub }));
vi.mock('../sections/project-overview', () => ({ ProjectOverview: mocks.OverviewStub }));

import { PropertiesPanel } from '../properties-panel';

const makeCard = (overrides: Partial<NonNullable<typeof mocks.activeCard>> = {}) => ({
  id: 'c1',
  nodes: [{ id: 'n1' }, { id: 'n2' }],
  edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
  ...overrides,
});

const callRender = (): unknown => (PropertiesPanel as () => unknown)();

beforeEach(() => {
  mocks.state.selection.selectedNodes = [];
  mocks.state.selection.selectedEdges = [];
  mocks.state.validation = { issues: [] };
  mocks.state.environments.activeEnvId = {};
  mocks.state.environments.byProject = {};
  mocks.activeCard = null;
});

describe('PropertiesPanel — selection routing', () => {
  it('renders ProjectOverview when no node/edge is selected', () => {
    mocks.activeCard = makeCard();
    const out = callRender() as { type: { displayName: string } };
    expect(out.type.displayName).toBe('ProjectOverview');
  });

  it('renders ProjectOverview with null activeCard', () => {
    mocks.activeCard = null;
    const out = callRender() as { type: { displayName: string } };
    expect(out.type.displayName).toBe('ProjectOverview');
  });

  it('renders EdgePropertiesSection when an edge is selected', () => {
    mocks.activeCard = makeCard();
    mocks.state.selection.selectedEdges = ['e1'];
    const out = callRender() as { type: { displayName: string } };
    expect(out.type.displayName).toBe('EdgePropertiesSection');
  });

  it('does NOT render EdgePropertiesSection when activeCard is null', () => {
    mocks.activeCard = null;
    mocks.state.selection.selectedEdges = ['e1'];
    const out = callRender() as { type: { displayName: string } };
    expect(out.type.displayName).toBe('ProjectOverview');
  });

  it('renders NodePropertiesSection when a node is selected', () => {
    mocks.activeCard = makeCard();
    mocks.state.selection.selectedNodes = ['n1'];
    const out = callRender() as { type: { displayName: string } };
    expect(out.type.displayName).toBe('NodePropertiesSection');
  });

  it('falls through to ProjectOverview when selectedNode id matches no node in card', () => {
    mocks.activeCard = makeCard();
    mocks.state.selection.selectedNodes = ['phantom'];
    const out = callRender() as { type: { displayName: string } };
    expect(out.type.displayName).toBe('ProjectOverview');
  });

  it('uses the LAST selected node when multiple are selected', () => {
    mocks.activeCard = makeCard();
    mocks.state.selection.selectedNodes = ['n1', 'n2'];
    const out = callRender() as {
      type: { displayName: string };
      props: { selectedNode?: { id?: string } };
    };
    expect(out.type.displayName).toBe('NodePropertiesSection');
    expect(out.props.selectedNode?.id).toBe('n2');
  });

  it('prefers an edge over a node when both are selected', () => {
    mocks.activeCard = makeCard();
    mocks.state.selection.selectedNodes = ['n1'];
    mocks.state.selection.selectedEdges = ['e1'];
    const out = callRender() as { type: { displayName: string } };
    expect(out.type.displayName).toBe('EdgePropertiesSection');
  });
});

describe('PropertiesPanel — environment resolution', () => {
  it('resolves activeEnvName from environments slice when projectId matches', () => {
    mocks.activeCard = makeCard({ projectId: 'p1' });
    mocks.state.selection.selectedNodes = ['n1'];
    mocks.state.environments.activeEnvId = { p1: 'env-prod' };
    mocks.state.environments.byProject = {
      p1: [
        { id: 'env-prod', name: 'production-tier' },
        { id: 'env-stage', name: 'staging' },
      ],
    };
    const out = callRender() as { props: { activeEnvName?: string } };
    expect(out.props.activeEnvName).toBe('production-tier');
  });

  it('falls back to "production" when env lookup misses', () => {
    mocks.activeCard = makeCard({ projectId: 'p1' });
    mocks.state.selection.selectedNodes = ['n1'];
    mocks.state.environments.activeEnvId = { p1: 'env-missing' };
    mocks.state.environments.byProject = { p1: [{ id: 'env-prod', name: 'production-tier' }] };
    const out = callRender() as { props: { activeEnvName?: string } };
    expect(out.props.activeEnvName).toBe('production');
  });

  it('falls back to "production" when projectId is empty', () => {
    mocks.activeCard = makeCard();
    mocks.state.selection.selectedNodes = ['n1'];
    const out = callRender() as { props: { activeEnvName?: string } };
    expect(out.props.activeEnvName).toBe('production');
  });

  it('reads projectId from selectedNode.data when activeCard has none', () => {
    const card = makeCard();
    card.nodes = [{ id: 'n1', data: { projectId: 'p99' } }];
    mocks.activeCard = card;
    mocks.state.selection.selectedNodes = ['n1'];
    mocks.state.environments.activeEnvId = { p99: 'env-99' };
    mocks.state.environments.byProject = { p99: [{ id: 'env-99', name: 'special' }] };
    const out = callRender() as { props: { activeEnvName?: string } };
    expect(out.props.activeEnvName).toBe('special');
  });
});

describe('PropertiesPanel — defensive', () => {
  it('handles missing validation slice gracefully', () => {
    mocks.activeCard = makeCard();
    mocks.state.selection.selectedNodes = ['n1'];
    mocks.state.validation = undefined;
    const out = callRender() as { props: { validationIssues?: unknown[] } };
    expect(out.props.validationIssues).toEqual([]);
    mocks.state.validation = { issues: [] };
  });
});
