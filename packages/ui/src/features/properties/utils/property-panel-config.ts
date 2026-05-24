/**
 * Per-iceType configuration for the properties panel.
 *
 * Cardinal-rule schema-driven dispatch. Both the visible-tabs builder
 * (`build-visible-tabs.ts`) AND the per-tab section rendering inside
 * `node-properties-section.tsx` read this table generically — no
 * `if (iceType === 'X')` branches in either layer.
 *
 * The table is the single declarative fact. Adding a new bespoke
 * properties experience for a block means adding an entry here; both
 * the tab builder and the panel pick it up automatically.
 */

/**
 * Tab identifiers the properties panel knows about. Tab visibility is
 * driven by a mix of dynamic signals (edge counts, scalable behaviour,
 * deployment state) AND per-block declarations from this table.
 */
export type PropertyPanelTabId = 'config' | 'domain' | 'scaling' | 'source' | 'connections' | 'deploy';

export interface BlockPropertyPanelConfig {
  /**
   * Tabs to FORCE visible for this block regardless of dynamic signals.
   * Combined with the dynamic tabs (e.g. `connections` always shows
   * when edges exist). Use this when a block has zero DB-defined
   * properties but still needs a config tab to host a bespoke section.
   */
  forceTabs?: PropertyPanelTabId[];
  /**
   * Suppress the deployment-target card (provider + region) at the top
   * of the panel. Use for symbolic blocks that don't deploy to a cloud
   * (Source.Repository points at GitHub; Network.PublicTraffic is
   * canvas-only).
   */
  skipDeploymentTarget?: boolean;
}

export const BLOCK_PROPERTY_PANEL_CONFIGS: Record<string, BlockPropertyPanelConfig> = {
  'Network.PublicEndpoint': {
    forceTabs: ['config', 'domain'],
  },
  'Network.CustomDomain': {
    forceTabs: ['config', 'domain'],
  },
  'Network.PrivateNetwork': {
    forceTabs: ['config'],
  },
  'Network.PublicTraffic': {
    skipDeploymentTarget: true,
  },
  'Config.Environment': {
    forceTabs: ['config'],
  },
  'Source.Repository': {
    forceTabs: ['source'],
    skipDeploymentTarget: true,
  },
};

/** Convenience accessor — returns an empty config when no entry exists. */
export function getBlockPropertyPanelConfig(iceType: string): BlockPropertyPanelConfig {
  return BLOCK_PROPERTY_PANEL_CONFIGS[iceType] ?? {};
}
