/**
 * Tests for `property-panel-config` — the schema-shaped per-iceType
 * config that drives the properties panel's tab visibility and the
 * deployment-target visibility.
 *
 * Cardinal rule check: the config is the single declarative fact.
 * Callers iterate it generically; they MUST NOT name a specific iceType.
 */

import { describe, it, expect } from 'vitest';
import { BLOCK_PROPERTY_PANEL_CONFIGS, getBlockPropertyPanelConfig } from '../property-panel-config';

describe('BLOCK_PROPERTY_PANEL_CONFIGS', () => {
  it('registers exactly the iceTypes that need a bespoke panel experience', () => {
    expect(Object.keys(BLOCK_PROPERTY_PANEL_CONFIGS).sort()).toEqual([
      'Config.Environment',
      'Network.CustomDomain',
      'Network.PrivateNetwork',
      'Network.PublicEndpoint',
      'Network.PublicTraffic',
      'Source.Repository',
    ]);
  });

  it('forces config + domain tabs for both kinds of public DNS block', () => {
    expect(BLOCK_PROPERTY_PANEL_CONFIGS['Network.PublicEndpoint'].forceTabs).toEqual(['config', 'domain']);
    expect(BLOCK_PROPERTY_PANEL_CONFIGS['Network.CustomDomain'].forceTabs).toEqual(['config', 'domain']);
  });

  it('skips the deployment-target card for symbolic / GitHub-backed blocks', () => {
    expect(BLOCK_PROPERTY_PANEL_CONFIGS['Source.Repository'].skipDeploymentTarget).toBe(true);
    expect(BLOCK_PROPERTY_PANEL_CONFIGS['Network.PublicTraffic'].skipDeploymentTarget).toBe(true);
  });
});

describe('getBlockPropertyPanelConfig', () => {
  it('returns the registered entry when present', () => {
    expect(getBlockPropertyPanelConfig('Source.Repository').skipDeploymentTarget).toBe(true);
  });

  it('returns an empty config for unknown iceTypes (no exception)', () => {
    expect(getBlockPropertyPanelConfig('Wholly.Unknown')).toEqual({});
    expect(getBlockPropertyPanelConfig('')).toEqual({});
  });
});
