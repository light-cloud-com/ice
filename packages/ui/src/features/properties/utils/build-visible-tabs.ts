/**
 * Tab list construction for the Node Properties Section.
 *
 * Extracted from `components/sections/node-properties-section.tsx` during
 * rf-npsec-3. Pure function: takes the node-level derivations and returns
 * the ordered list of visible tabs. The orchestrator still owns the
 * setState-during-render fallback (BEHAVIOR-RISK FLAG #2) — see the doc
 * comment on `node-properties-section.tsx` for why that line stays inline.
 */

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
  const tabs: VisibleTab[] = [];
  if (
    dbPropertiesCount > 0 ||
    iceType === 'Config.Environment' ||
    iceType === 'Network.PublicEndpoint' ||
    iceType === 'Network.CustomDomain'
  ) {
    tabs.push({ id: 'config', label: t('properties.tabs.config'), show: true });
  }
  if (isScalable) {
    tabs.push({ id: 'scaling', label: t('properties.tabs.scaling'), show: true });
  }
  if (iceType === 'Network.PublicEndpoint' || iceType === 'Network.CustomDomain') {
    tabs.push({ id: 'domain', label: t('properties.tabs.domain'), show: true });
  }
  if (hasSource || iceType === 'Source.Repository') {
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
