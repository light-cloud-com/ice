/**
 * rf-npsec-3 — buildVisibleTabs unit tests.
 */

import { describe, it, expect } from 'vitest';
import { buildVisibleTabs } from '../build-visible-tabs';

const tFn = (k: string) => `t:${k}`;

const baseArgs = {
  iceType: '',
  dbPropertiesCount: 0,
  isScalable: false,
  hasSource: false,
  hasDeployment: false,
  incomingEdgesCount: 0,
  outgoingEdgesCount: 0,
  t: tFn,
};

describe('buildVisibleTabs', () => {
  it('returns no tabs when nothing applies', () => {
    expect(buildVisibleTabs(baseArgs)).toEqual([]);
  });

  it('pushes config when dbPropertiesCount > 0', () => {
    const tabs = buildVisibleTabs({ ...baseArgs, dbPropertiesCount: 3 });
    expect(tabs.map((t) => t.id)).toEqual(['config']);
  });

  it('pushes config for Config.Environment', () => {
    const tabs = buildVisibleTabs({ ...baseArgs, iceType: 'Config.Environment' });
    expect(tabs.map((t) => t.id)).toEqual(['config']);
  });

  it('pushes config for Network.PublicEndpoint', () => {
    const tabs = buildVisibleTabs({ ...baseArgs, iceType: 'Network.PublicEndpoint' });
    expect(tabs.map((t) => t.id).sort()).toEqual(['config', 'domain']);
  });

  it('pushes config for Network.CustomDomain', () => {
    const tabs = buildVisibleTabs({ ...baseArgs, iceType: 'Network.CustomDomain' });
    expect(tabs.map((t) => t.id).sort()).toEqual(['config', 'domain']);
  });

  it('pushes scaling when isScalable=true', () => {
    const tabs = buildVisibleTabs({ ...baseArgs, isScalable: true });
    expect(tabs.map((t) => t.id)).toEqual(['scaling']);
  });

  it('pushes domain only for PublicEndpoint and CustomDomain', () => {
    const tabsA = buildVisibleTabs({ ...baseArgs, iceType: 'Network.PublicEndpoint' });
    const tabsB = buildVisibleTabs({ ...baseArgs, iceType: 'Network.CustomDomain' });
    const tabsC = buildVisibleTabs({ ...baseArgs, iceType: 'Network.Gateway' });
    expect(tabsA.find((t) => t.id === 'domain')).toBeDefined();
    expect(tabsB.find((t) => t.id === 'domain')).toBeDefined();
    expect(tabsC.find((t) => t.id === 'domain')).toBeUndefined();
  });

  it('pushes source when hasSource=true', () => {
    const tabs = buildVisibleTabs({ ...baseArgs, hasSource: true });
    expect(tabs.map((t) => t.id)).toEqual(['source']);
  });

  it('pushes source for Source.Repository iceType (special case)', () => {
    const tabs = buildVisibleTabs({ ...baseArgs, iceType: 'Source.Repository' });
    expect(tabs.map((t) => t.id)).toEqual(['source']);
  });

  it('pushes connections when there are incoming or outgoing edges', () => {
    const tabsIn = buildVisibleTabs({ ...baseArgs, incomingEdgesCount: 1 });
    const tabsOut = buildVisibleTabs({ ...baseArgs, outgoingEdgesCount: 1 });
    expect(tabsIn.map((t) => t.id)).toEqual(['connections']);
    expect(tabsOut.map((t) => t.id)).toEqual(['connections']);
  });

  it('pushes deploy with dot=true when hasDeployment', () => {
    const tabs = buildVisibleTabs({ ...baseArgs, hasDeployment: true });
    expect(tabs[0]).toMatchObject({ id: 'deploy', dot: true });
  });

  it('preserves canonical tab order: config, scaling, domain, source, connections, deploy', () => {
    const tabs = buildVisibleTabs({
      ...baseArgs,
      iceType: 'Network.CustomDomain',
      dbPropertiesCount: 5,
      isScalable: true,
      hasSource: true,
      hasDeployment: true,
      incomingEdgesCount: 2,
    });
    expect(tabs.map((t) => t.id)).toEqual(['config', 'scaling', 'domain', 'source', 'connections', 'deploy']);
  });

  it('uses the supplied t() function for labels', () => {
    const tabs = buildVisibleTabs({ ...baseArgs, dbPropertiesCount: 1 });
    expect(tabs[0].label).toBe('t:properties.tabs.config');
  });
});
