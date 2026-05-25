/**
 * Tab list construction for the Node Properties Section.
 *
 * Extracted from `components/sections/node-properties-section.tsx` during
 * rf-npsec-3. Pure function: takes the node-level derivations and returns
 * the ordered list of visible tabs. The orchestrator still owns the
 * setState-during-render fallback (BEHAVIOR-RISK FLAG #2) — see the doc
 * comment on `node-properties-section.tsx` for why that line stays inline.
 *
 * Cardinal-rule schema-driven: per-iceType tab visibility comes from
 * `BLOCK_PROPERTY_PANEL_CONFIGS.forceTabs`. NO `if (iceType === 'X')`
 * branches in this builder. Adding a new block that needs a forced tab
 * adds an entry to the config table; this code stays unchanged.
 */

import { getBlockPropertyPanelConfig, type PropertyPanelTabId } from './property-panel-config';

export interface VisibleTab {
  id: string;
  label: string;
  show: boolean;
  dot?: boolean;
}

export interface BuildVisibleTabsArgs {
  iceType: string;
  dbPropertiesCount: number;
  isScalable: boolean;
  hasSource: boolean;
  hasDeployment: boolean;
  incomingEdgesCount: number;
  outgoingEdgesCount: number;
  /** Translation function. Provided by the orchestrator's `useTranslation`. */
  t: (key: string) => string;
}

export function buildVisibleTabs({
  iceType,
  dbPropertiesCount,
  isScalable,
  hasSource,
  hasDeployment,
  incomingEdgesCount,
  outgoingEdgesCount,
  t,
}: BuildVisibleTabsArgs): VisibleTab[] {
  const forced = new Set<PropertyPanelTabId>(getBlockPropertyPanelConfig(iceType).forceTabs ?? []);
  const tabs: VisibleTab[] = [];
  // Config tab: dynamic when the block has DB-declared properties OR
  // when the schema-shaped table forces it for a bespoke panel.
  if (dbPropertiesCount > 0 || forced.has('config')) {
    tabs.push({ id: 'config', label: t('properties.tabs.config'), show: true });
  }
  if (isScalable) {
    tabs.push({ id: 'scaling', label: t('properties.tabs.scaling'), show: true });
  }
  // Domain tab: schema-shaped table only — no dynamic signal drives it.
  if (forced.has('domain')) {
    tabs.push({ id: 'domain', label: t('properties.tabs.domain'), show: true });
  }
  // Source tab: dynamic when the block participates in a build pipeline
  // OR when the schema-shaped table forces it for the repo block itself.
  if (hasSource || forced.has('source')) {
    tabs.push({ id: 'source', label: t('properties.tabs.source'), show: true });
  }
  if (incomingEdgesCount > 0 || outgoingEdgesCount > 0) {
    tabs.push({ id: 'connections', label: t('properties.tabs.connections'), show: true });
  }
  if (hasDeployment) {
    tabs.push({ id: 'deploy', label: t('properties.tabs.deploy'), show: true, dot: true });
  }
  return tabs.filter((tt) => tt.show);
}
