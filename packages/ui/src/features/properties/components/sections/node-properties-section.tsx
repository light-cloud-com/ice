/**
 * Node Properties Section — right-sidebar panel rendered when the user has
 * selected exactly one node on the active card.
 *
 * Renders the full node-selected branch of the right-side properties panel:
 * a top-of-branch derivation block (resourceDef, dbProperties, isScalable,
 * iconUrl, incoming/outgoing edge filters, etc.), a `PanelHeader`, the node
 * identity card (icon + editable name + display-name/iceType/provider chips),
 * the `DesignRequirements` block, an optional `GroupColorPicker` (only for
 * container nodes), an optional Custom Domain inheritance banner (when this
 * node is the target of a `Network.CustomDomain` edge), the Tab bar, and
 * each tab's content panel (deploy / source / scaling / domain / connections /
 * config). The Config tab is the multi-fallback panel that stitches together
 * `PropertyFields`, `EnvVarsEditor`, `CustomDomainPanel`, `PrivateNetworkPanel`,
 * `MonitoringLogSection`, and the Source-Repository / Service-source panels
 * when there's <=1 visible tab — the `<= 1` gate is what made the previous
 * single-tab projects collapse cleanly.
 *
 * BEHAVIOR-RISK FLAG #2 — preserved verbatim. The setState-during-render
 * fallback at the tabs computation block (`if (visibleTabs.length > 0 &&
 * !visibleTabs.some((t) => t.id === activeTab)) setPropsTab(visibleTabs[0].id)`)
 * stays AT THE EXACT JSX position it had in the orchestrator. React tolerates
 * this pattern because the call is conditional and idempotent: it only fires
 * when the current tab is no longer visible (e.g. the user just disconnected
 * an edge and the `connections` tab disappeared), and the next render produces
 * a `visibleTabs.some(...)` true so the call doesn't repeat. The propsTab
 * useState lives in the orchestrator (`PropertiesPanel` in
 * `properties-panel.tsx`); both the value and the setter are passed in as
 * props — that's the lift-up pattern we use whenever a setState-during-render
 * fallback is involved.
 *
 * Stays Redux-coupled: uses `useDispatch` internally for `toggleProperties`
 * (the panel close button), `updateCardNodeData` (every node-data write
 * routed through the local `updateNodeField` callback), and the
 * `CustomDomainPanel`'s direct dispatch needs (passed as a prop to that
 * subcomponent). Reads no extra state — every selector lives in the
 * orchestrator and is passed in via props (`activeCard`, `selectedNode`,
 * `resourceMap`, `propertyIssuesMap`, `validationIssues`, `activeEnvName`).
 *
 * Extracted verbatim from `properties-panel.tsx` lines 121–578 during
 * rf-props-24. Every relative path bumped one segment for the new
 * `components/sections/` depth: `../../../assets/icons` →
 * `../../../../assets/icons`, `../../../i18n` → `../../../../i18n`,
 * `../../../shared/...` → `../../../../shared/...`, `../../../store/...` →
 * `../../../../store/...`, `./fields` → `../fields`, `./fields/render-property-field`
 * → `../fields/render-property-field`, `./design-requirements` →
 * `../design-requirements`, `./sections/<x>` → `./<x>`. All inline derivations
 * (custom-domain edge walk, tab construction, tab fallback, per-tab JSX gating)
 * preserved exactly. The local `updateNodeField` callback closes over the
 * passed-in `selectedNode.id`; dispatch shapes for `updateCardNodeData` are
 * byte-identical.
 */

import React, { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from '../../../../i18n';
import { PanelHeader } from '../../../../shared/components/ui/panel-header';
import { DesignRequirements } from '../design-requirements';
import { Section } from '../fields';
import { ConnectionCard } from './connection-card';
import { CustomDomainBanner } from './custom-domain-banner';
import { CustomDomainPanel } from './custom-domain-panel';
import { DeployTabBody } from './deploy-tab-body';
import { DeploymentTargetCard } from './deployment-target-card';
import { PublicEndpointDomainSection } from './domain-section';
import { EnvVarsEditor } from './env-vars-editor';
import { GroupColorPicker } from './group-color-picker';
import { MonitoringLogSection } from './monitoring-log-section';
import { NodeIdentityCard } from './node-identity-card';
import { PipelineSection } from './pipeline-section';
import { PrivateNetworkPanel } from './private-network-panel';
import { PropertiesTabBar } from './properties-tab-bar';
import { ScalingSection } from './scaling-section';
import { ServiceSourceSection } from './service-source-section';
import { SourceRepositorySection } from './source-repository-section';
import { updateCardNodeData, type Card, type CardNode } from '../../../../store/slices/cards-slice';
import { toggleProperties } from '../../../../store/slices/ui-slice';
import { buildVisibleTabs } from '../../utils/build-visible-tabs';
import { nodeHasSourceTab, resolveNodeIconUrl } from '../../utils/node-properties-derivations';
import {
  getBlockPropertyPanelConfig,
  type PropertyPanelSectionId,
  type PropertyPanelTabId,
} from '../../utils/property-panel-config';

// =============================================================================
// Schema-driven per-tab section dispatch
// =============================================================================
//
// Each entry maps a `PropertyPanelSectionId` (registered on
// `BLOCK_PROPERTY_PANEL_CONFIGS[iceType].sections[tab]`) to a factory
// that renders the corresponding section component. The panel body
// iterates this table generically — no `if (iceType === 'X')` branches
// in the JSX. Adding a new bespoke section adds an entry here AND in
// the schema config; the dispatcher stays untouched.

interface SectionRenderCtx {
  selectedNode: CardNode;
  activeCard: Card;
  outgoingEdges: Card['edges'];
  updateNodeField: (field: string, value: unknown) => void;
  dispatch: AppDispatch;
  nodeRepo: string;
  activeEnvName: string;
}

type SectionFactory = (ctx: SectionRenderCtx) => React.ReactNode;

const SECTION_COMPONENTS: Record<PropertyPanelSectionId, SectionFactory> = {
  'public-endpoint-domain': (ctx) => (
    <PublicEndpointDomainSection selectedNode={ctx.selectedNode} updateNodeField={ctx.updateNodeField} />
  ),
  'custom-domain-panel': (ctx) => (
    <CustomDomainPanel
      selectedNode={ctx.selectedNode}
      outgoingEdges={ctx.outgoingEdges}
      activeCard={ctx.activeCard}
      updateNodeField={ctx.updateNodeField}
      dispatch={ctx.dispatch}
    />
  ),
  'private-network-panel': (ctx) => (
    <PrivateNetworkPanel selectedNode={ctx.selectedNode} updateNodeField={ctx.updateNodeField} />
  ),
  'env-vars-editor': (ctx) => (
    <EnvVarsEditor
      variables={
        (ctx.selectedNode?.data?.variables as Array<{ name: string; value: string; isSecret?: boolean }>) || []
      }
      onChange={(vars) => ctx.updateNodeField('variables', vars)}
    />
  ),
  'source-repository': (ctx) => (
    <SourceRepositorySection
      nodeRepo={ctx.nodeRepo}
      nodeBranch={(ctx.selectedNode?.data?.branch as string) || 'main'}
      buildCommand={(ctx.selectedNode?.data?.buildCommand as string) || ''}
      outputDirectory={(ctx.selectedNode?.data?.outputDirectory as string) || ''}
      onUpdateField={ctx.updateNodeField}
      sourceNodeId={ctx.selectedNode.id}
      activeCard={ctx.activeCard}
      activeEnvName={ctx.activeEnvName}
    />
  ),
  'monitoring-log': (ctx) => <MonitoringLogSection nodeId={ctx.selectedNode.id} />,
};

/**
 * Render every schema-declared section configured under `tab` for the
 * given iceType. Returns an array of ReactNodes (one per section);
 * generic iteration, no iceType-specific branches.
 */
function renderSectionsForTab(iceType: string, tab: PropertyPanelTabId, ctx: SectionRenderCtx): React.ReactNode[] {
  const ids = getBlockPropertyPanelConfig(iceType).sections?.[tab] ?? [];
  return ids.map((id, idx) => {
    const factory = SECTION_COMPONENTS[id];
    return factory ? <React.Fragment key={`${id}-${idx}`}>{factory(ctx)}</React.Fragment> : null;
  });
}
import { PropertyFields } from '../fields/render-property-field';
import type { AppDispatch } from '../../../../store';
import type { CanvasIssue } from '../../../../store/slices/validation-slice';
import type { ResourceDef } from '../../hooks/use-resource-map';

// ─── Node Properties Section ────────────────────────────────────────────────

export const NodePropertiesSection: React.FC<{
  selectedNode: CardNode;
  activeCard: Card;
  resourceMap: Map<string, ResourceDef>;
  propertyIssuesMap: Map<string, { severity: string; message: string }> | undefined;
  propsTab: string;
  setPropsTab: (id: string) => void;
  validationIssues: ReadonlyArray<CanvasIssue>;
  activeEnvName: string;
}> = ({
  selectedNode,
  activeCard,
  resourceMap,
  propertyIssuesMap,
  propsTab,
  setPropsTab,
  validationIssues,
  activeEnvName,
}) => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();

  const selectedNodeId = selectedNode.id;
  const nodeRepo = (selectedNode?.data?.repository as string) || '';

  const updateNodeField = useCallback(
    (field: string, value: unknown) => {
      if (!selectedNodeId) return;
      dispatch(updateCardNodeData({ nodeId: selectedNodeId, data: { [field]: value } }));
    },
    [dispatch, selectedNodeId],
  );

  const iceType = (selectedNode.data?.iceType as string) || '';
  const resourceId = (selectedNode.data?.resourceId as string) || '';
  const provider = (selectedNode.data?.provider as string) || '';
  const label = (selectedNode.data?.name as string) || (selectedNode.data?.label as string) || '';
  const estimatedCost = (selectedNode.data?.estimatedCost as string) || '';

  // Look up properties from core DB — try resourceId first, then iceType
  const resourceDef = resourceMap.get(resourceId) || resourceMap.get(iceType);
  const dbProperties = resourceDef?.properties || [];

  // Scaling data — only `isScalable` is needed at the orchestrator level (drives the tab list);
  // the rest of the scaling-derived values live inside `ScalingSection`.
  const behavior = (selectedNode.data?.behavior as string) || '';
  const isScalable = behavior === 'scalable';

  // Get icon
  const iconUrl = resolveNodeIconUrl(selectedNode, iceType, provider, label);

  // Connections for this node
  const incomingEdges = activeCard.edges.filter((e) => e.target === selectedNode.id);
  const outgoingEdges = activeCard.edges.filter((e) => e.source === selectedNode.id);

  return (
    <div id="ice-properties-panel" className="h-full flex flex-col bg-inherit overflow-y-auto">
      {/* Header */}
      <PanelHeader
        title={t('properties.title')}
        onClose={() => dispatch(toggleProperties())}
        closeLabel={t('properties.closeTitle')}
      />

      {/* Node identity */}
      <NodeIdentityCard
        selectedNode={selectedNode}
        iconUrl={iconUrl}
        label={label}
        iceType={iceType}
        provider={provider}
        resourceDef={resourceDef}
        onUpdateName={(name) => updateNodeField('name', name)}
      />

      {/* ── Deployment target (provider + region) ──
          Hidden for symbolic block types that don't deploy to a cloud
          (e.g. Source.Repository points at GitHub; Network.PublicTraffic is
          a canvas-only Internet terminator). Whether a block is symbolic
          is a per-iceType fact declared on the schema-shaped
          `BLOCK_PROPERTY_PANEL_CONFIGS.skipDeploymentTarget` — this
          render decision iterates that fact, never names a specific
          iceType. */}
      {!getBlockPropertyPanelConfig(iceType).skipDeploymentTarget && (
        <DeploymentTargetCard
          provider={provider}
          region={(selectedNode.data?.region as string) || ''}
          onUpdate={(field, value) => updateNodeField(field, value)}
        />
      )}

      {/* ── Design requirements (prototype: Postgres + PrivateNetwork) ──
          Surfaces missing connections, missing required props, and
          implicit handler choices BEFORE the user clicks deploy. Pure
          client-side; no network calls. */}
      <DesignRequirements node={selectedNode} allNodes={activeCard.nodes} edges={activeCard.edges} />

      {/* ── Group color picker — ONLY for synthetic decoration groups,
          i.e. nodes whose `iceType` follows the `Group.*` convention
          (Group.Frontend, Group.Monitoring, …).
          Real palette container-blocks (Network.PrivateNetwork,
          Network.VPC, Network.Subnet, …) own their own properties UI
          (ingress / egress, CIDR, etc.) and must NOT show the
          generic group color/opacity controls — those would suggest
          the block is just a decoration when it actually carries
          security semantics. */}
      {selectedNode.type === 'container' && iceType.startsWith('Group.') && (
        <GroupColorPicker
          color={(selectedNode.data?.groupColor as string) || '#3b82f6'}
          opacity={(selectedNode.data?.groupOpacity as number) ?? 0.1}
          onChange={(color) => updateNodeField('groupColor', color)}
          onOpacityChange={(opacity) => updateNodeField('groupOpacity', opacity)}
        />
      )}

      {/* ── Custom Domain inheritance banner ── */}
      <CustomDomainBanner selectedNode={selectedNode} activeCard={activeCard} />

      {/* ── Navigation Tabs ── */}
      {(() => {
        const hasDeployment = !!selectedNode.data?.provider_id;
        const hasSource = nodeHasSourceTab(iceType);
        const activeTab = propsTab;

        const visibleTabs = buildVisibleTabs({
          iceType,
          dbPropertiesCount: dbProperties.length,
          isScalable,
          hasSource,
          hasDeployment,
          incomingEdgesCount: incomingEdges.length,
          outgoingEdgesCount: outgoingEdges.length,
          t,
        });
        // BEHAVIOR-RISK FLAG #2 — fall back to first tab if current tab doesn't
        // exist. Stays at the EXACT JSX position the original orchestrator had it.
        if (visibleTabs.length > 0 && !visibleTabs.some((tt) => tt.id === activeTab)) {
          setPropsTab(visibleTabs[0].id);
        }

        // PE2 — the per-field config validation lives in propertyIssuesMap;
        // surface its error/warning counts as a badge on the Config tab so the
        // signal isn't trapped there when the user is on another tab.
        let configErrors = 0;
        let configWarnings = 0;
        propertyIssuesMap?.forEach((issue) => {
          if (issue.severity === 'error') configErrors += 1;
          else if (issue.severity === 'warning') configWarnings += 1;
        });
        const issueCounts =
          configErrors > 0 || configWarnings > 0
            ? { config: { errors: configErrors, warnings: configWarnings } }
            : undefined;

        return (
          <>
            <PropertiesTabBar
              visibleTabs={visibleTabs}
              activeTab={activeTab}
              onSelect={setPropsTab}
              issueCounts={issueCounts}
            />

            {/* ════ DEPLOY TAB ════ */}
            {activeTab === 'deploy' && hasDeployment && (
              <DeployTabBody selectedNode={selectedNode} activeCard={activeCard} />
            )}

            {/* ════ SOURCE & CI TAB ════ */}
            {activeTab === 'source' && (
              <div className="pt-1">
                {hasSource && (
                  <>
                    <ServiceSourceSection
                      nodeId={selectedNode!.id}
                      nodeRepo={nodeRepo}
                      nodeBranch={(selectedNode?.data?.branch as string) || ''}
                      activeCard={activeCard}
                    />
                    <PipelineSection
                      cardId={activeCard.id}
                      nodeId={selectedNode!.id}
                      nodeRepo={nodeRepo}
                      activeCard={activeCard}
                    />
                  </>
                )}
                {/* Bespoke sections registered for the source tab in
                    BLOCK_PROPERTY_PANEL_CONFIGS — currently the
                    Source.Repository section. */}
                {renderSectionsForTab(iceType, 'source', {
                  selectedNode,
                  activeCard,
                  outgoingEdges,
                  updateNodeField,
                  dispatch,
                  nodeRepo,
                  activeEnvName,
                })}
              </div>
            )}

            {/* ════ SCALING TAB ════ */}
            {activeTab === 'scaling' && isScalable && (
              <ScalingSection selectedNode={selectedNode} updateNodeField={updateNodeField} />
            )}

            {/* ════ DOMAIN TAB ════
                Bespoke sections registered for the domain tab — currently
                the PublicEndpoint + CustomDomain panels. Dispatch is
                schema-driven; no iceType branches. */}
            {activeTab === 'domain' &&
              renderSectionsForTab(iceType, 'domain', {
                selectedNode,
                activeCard,
                outgoingEdges,
                updateNodeField,
                dispatch,
                nodeRepo,
                activeEnvName,
              })}

            {/* ════ CONNECTIONS TAB ════ */}
            {activeTab === 'connections' && (incomingEdges.length > 0 || outgoingEdges.length > 0) && (
              <div className="px-2 py-1 space-y-0">
                {[...incomingEdges, ...outgoingEdges].map((edge) => (
                  <ConnectionCard
                    key={edge.id}
                    edge={edge}
                    thisNodeId={selectedNode!.id}
                    nodes={activeCard.nodes}
                    dispatch={dispatch}
                  />
                ))}
              </div>
            )}

            {/* ════ CONFIG TAB ════ */}
            {activeTab === 'config' && (
              <>
                {/* Validation issues banner */}
                {selectedNodeId &&
                  (() => {
                    const nodeIssues = validationIssues.filter(
                      (i) => i.nodeId === selectedNodeId && i.severity !== 'info',
                    );
                    if (nodeIssues.length === 0) return null;
                    const errorCount = nodeIssues.filter((i) => i.severity === 'error').length;
                    const warnCount = nodeIssues.filter((i) => i.severity === 'warning').length;
                    return (
                      <div
                        className={`mx-2 mt-1 mb-1 px-3 py-2 rounded-md text-ice-2xs ${
                          errorCount > 0
                            ? 'bg-red-500/10 border border-red-500/20'
                            : 'bg-amber-500/10 border border-amber-500/20'
                        }`}
                      >
                        <div className={`font-medium ${errorCount > 0 ? 'text-red-400' : 'text-amber-400'}`}>
                          {errorCount > 0 && `${errorCount} error${errorCount > 1 ? 's' : ''}`}
                          {errorCount > 0 && warnCount > 0 && ' · '}
                          {warnCount > 0 && `${warnCount} warning${warnCount > 1 ? 's' : ''}`}
                        </div>
                        {nodeIssues.slice(0, 3).map((issue) => (
                          <div key={issue.id} className="mt-0.5 text-ice-text-3">
                            {issue.message}
                            {issue.suggestion && <span className="text-ice-text-3/50"> — {issue.suggestion}</span>}
                          </div>
                        ))}
                        {nodeIssues.length > 3 && (
                          <div className="mt-0.5 text-ice-text-3/50">+{nodeIssues.length - 3} more</div>
                        )}
                      </div>
                    );
                  })()}

                {/* Configuration fields — tiered */}
                {dbProperties.length > 0 && (
                  <PropertyFields
                    properties={dbProperties}
                    nodeData={selectedNode.data || {}}
                    onFieldChange={updateNodeField}
                    propertyIssues={propertyIssuesMap}
                    selfNodeId={selectedNode.id}
                  />
                )}

                {/* Source (when no tabs) — kept as a dynamic fallback for
                    service blocks that have a connected Source.Repository
                    but no dedicated source tab. The Source.Repository
                    block itself now always has its own source tab via
                    BLOCK_PROPERTY_PANEL_CONFIGS.forceTabs. */}
                {visibleTabs.length <= 1 && hasSource && (
                  <>
                    <ServiceSourceSection
                      nodeId={selectedNode!.id}
                      nodeRepo={nodeRepo}
                      nodeBranch={(selectedNode?.data?.branch as string) || ''}
                      activeCard={activeCard}
                    />
                    <PipelineSection
                      cardId={activeCard.id}
                      nodeId={selectedNode!.id}
                      nodeRepo={nodeRepo}
                      activeCard={activeCard}
                    />
                  </>
                )}

                {/* Bespoke sections registered for the config tab in
                    BLOCK_PROPERTY_PANEL_CONFIGS — env-vars editor for
                    Config.Environment, mirrored Custom Domain panel,
                    Private Network egress panel, Monitoring.Log section.
                    Dispatch is generic — no iceType branches. */}
                {renderSectionsForTab(iceType, 'config', {
                  selectedNode,
                  activeCard,
                  outgoingEdges,
                  updateNodeField,
                  dispatch,
                  nodeRepo,
                  activeEnvName,
                })}

                {/* Cost */}
                {estimatedCost && (
                  <Section title={t('properties.config.cost')}>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-ice-sm text-ice-text-2">{t('properties.config.estimatedMonthly')}</span>
                      <span className="text-ice-sm text-emerald-400 font-mono">{estimatedCost}</span>
                    </div>
                  </Section>
                )}

                {/* Cost estimate (if available) */}
              </>
            )}
          </>
        );
      })()}
    </div>
  );
};
