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

/**
 * Identifies a bespoke section component the panel can render inside a
 * tab. The component itself is wired in `node-properties-section.tsx`
 * via the `SECTION_COMPONENTS` factory map — this string is the
 * registry key.
 */
export type PropertyPanelSectionId =
  | 'public-endpoint-domain'
  | 'custom-domain-panel'
  | 'private-network-panel'
  | 'env-vars-editor'
  | 'source-repository'
  | 'monitoring-log';

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
  /**
   * Bespoke sections to render inside specific tabs. The panel renders
   * each entry whose tab matches `activeTab`. Same id can appear under
   * multiple tabs (e.g. Custom Domain's panel mirrors on both `config`
   * and `domain`).
   */
  sections?: Partial<Record<PropertyPanelTabId, PropertyPanelSectionId[]>>;
}

export const BLOCK_PROPERTY_PANEL_CONFIGS: Record<string, BlockPropertyPanelConfig> = {
  'Network.PublicEndpoint': {
    forceTabs: ['config', 'domain'],
    sections: { domain: ['public-endpoint-domain'] },
  },
  'Network.CustomDomain': {
    forceTabs: ['config', 'domain'],
    // The config tab mirrors the domain tab so the user sees the root
    // domain field + subdomain routing list as soon as they click the block.
    sections: { domain: ['custom-domain-panel'], config: ['custom-domain-panel'] },
  },
  'Network.PrivateNetwork': {
    forceTabs: ['config'],
    sections: { config: ['private-network-panel'] },
  },
  'Network.PublicTraffic': {
    skipDeploymentTarget: true,
  },
  'Config.Environment': {
    forceTabs: ['config'],
    sections: { config: ['env-vars-editor'] },
  },
  'Source.Repository': {
    forceTabs: ['source'],
    skipDeploymentTarget: true,
    // SourceRepositorySection renders inside the source tab. (The
    // previous code also showed it in the config tab when no other tabs
    // existed; with the source tab now always forced for this block,
    // that fallback became dead code and was dropped.)
    sections: { source: ['source-repository'] },
  },
  'Monitoring.Log': {
    sections: { config: ['monitoring-log'] },
  },
};

/** Convenience accessor — returns an empty config when no entry exists. */
export function getBlockPropertyPanelConfig(iceType: string): BlockPropertyPanelConfig {
  return BLOCK_PROPERTY_PANEL_CONFIGS[iceType] ?? {};
}
