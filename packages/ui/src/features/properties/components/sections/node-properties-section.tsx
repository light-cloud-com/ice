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
import { cn } from '../../../../shared/utils/cn';
import { DesignRequirements } from '../design-requirements';
import { Section } from '../fields';
import { PropertyFields } from '../fields/render-property-field';
import { ConnectionCard } from './connection-card';
import { CustomDomainPanel } from './custom-domain-panel';
import { DeployHistory } from './deploy-history';
import { PublicEndpointDomainSection } from './domain-section';
import { DriftIndicator, DriftCheckButton } from './drift';
import { EnvVarsEditor } from './env-vars-editor';
import { GroupColorPicker } from './group-color-picker';
import { MonitoringLogSection } from './monitoring-log-section';
import { PipelineSection } from './pipeline-section';
import { PrivateNetworkPanel } from './private-network-panel';
import { ScalingSection } from './scaling-section';
import { ServiceSourceSection } from './service-source-section';
import { SourceRepositorySection } from './source-repository-section';
import {
  updateCardNodeData,
  type Card,
  type CardNode,
} from '../../../../store/slices/cards-slice';
import { toggleProperties } from '../../../../store/slices/ui-slice';
import type { AppDispatch } from '../../../../store';
import type { ResourceDef } from '../../hooks/use-resource-map';
import type { CanvasIssue } from '../../../../store/slices/validation-slice';
import {
  findCustomDomainEdge,
  nodeHasSourceTab,
  resolveNodeIconUrl,
} from '../../utils/node-properties-derivations';

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
      <div className="px-3 py-3 border-b border-ice-border">
        <div className="flex items-center gap-2 mb-1.5">
          <img src={iconUrl} alt="" className="w-5 h-5" />
          <input
            id="ice-properties-node-name"
            type="text"
            defaultValue={label}
            key={selectedNode?.id}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== label) updateNodeField('name', v);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="flex-1 bg-transparent border-none text-ice-md text-ice-text-1 font-semibold outline-none focus:bg-ice-raised rounded px-1 -ml-1 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {resourceDef && (
            <span className="text-ice-2xs bg-ice-raised text-ice-text-2 px-1.5 py-0.5 rounded font-mono">
              {resourceDef.display_name}
            </span>
          )}
          {iceType && !resourceDef && (
            <span className="text-ice-2xs bg-ice-raised text-ice-text-2 px-1.5 py-0.5 rounded font-mono">
              {iceType}
            </span>
          )}
          {provider && (
            <span className="text-ice-2xs bg-blue-950/50 text-blue-400 px-1.5 py-0.5 rounded font-mono uppercase">
              {provider}
            </span>
          )}
        </div>
      </div>

      {/* ── Design requirements (prototype: Postgres + PrivateNetwork) ──
          Surfaces missing connections, missing required props, and
          implicit handler choices BEFORE the user clicks deploy. Pure
          client-side; no network calls. */}
      <DesignRequirements node={selectedNode} allNodes={activeCard.nodes} edges={activeCard.edges} />

      {/* ── Group color picker (only for container/group nodes) ── */}
      {selectedNode.type === 'container' && (
        <GroupColorPicker
          color={(selectedNode.data?.groupColor as string) || '#3b82f6'}
          opacity={(selectedNode.data?.groupOpacity as number) ?? 0.1}
          onChange={(color) => updateNodeField('groupColor', color)}
          onOpacityChange={(opacity) => updateNodeField('groupOpacity', opacity)}
        />
      )}

      {/* ── Custom Domain inheritance banner ──
          When this node is the target of a Network.CustomDomain edge,
          its `domain` property is force-managed by the Custom Domain
          block (the canvas effect in svg-canvas.tsx keeps it in sync).
          Surface this prominently so the user understands why editing
          the domain field gets immediately overwritten. */}
      {(() => {
        if (!activeCard || !selectedNode) return null;
        const cdResult = findCustomDomainEdge(activeCard, selectedNode);
        if (!cdResult) return null;
        const cdLabel = (cdResult.cdNode.data?.label as string) || 'Custom Domain';
        const inheritedDomain = (selectedNode.data?.domain as string) || '';
        return (
          <div className="px-3 py-2 border-b border-ice-border bg-blue-500/5">
            <div className="flex items-center gap-1.5 text-ice-2xs text-blue-400">
              <span>🌐</span>
              <span className="font-medium">Domain managed by</span>
              <span className="font-mono">{cdLabel}</span>
            </div>
            {inheritedDomain && (
              <div className="mt-0.5 text-ice-xs font-mono text-ice-text-1 truncate" title={inheritedDomain}>
                {inheritedDomain}
              </div>
            )}
            <div className="mt-0.5 text-ice-2xs text-ice-text-3 leading-snug">
              Edit the route on the Custom Domain block to change this. Disconnect the edge to set a domain manually.
            </div>
          </div>
        );
      })()}

      {/* ── Navigation Tabs ── */}
      {(() => {
        const hasDeployment = !!selectedNode.data?.provider_id;
        const hasSource = nodeHasSourceTab(iceType);
        const activeTab = propsTab;

        // Tabs are derived from the node's actual content — not hardcoded
        const tabs: Array<{ id: string; label: string; show: boolean; dot?: boolean }> = [];
        if (
          dbProperties.length > 0 ||
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
        if (incomingEdges.length > 0 || outgoingEdges.length > 0) {
          tabs.push({ id: 'connections', label: t('properties.tabs.connections'), show: true });
        }
        if (hasDeployment) {
          tabs.push({ id: 'deploy', label: t('properties.tabs.deploy'), show: true, dot: true });
        }
        const visibleTabs = tabs.filter((t) => t.show);
        // Fall back to first tab if current tab doesn't exist
        if (visibleTabs.length > 0 && !visibleTabs.some((t) => t.id === activeTab)) {
          setPropsTab(visibleTabs[0].id);
        }

        return (
          <>
            {/* Tab bar — always shown when >1 tab */}
            {visibleTabs.length > 1 && (
              <div className="flex border-b border-ice-border shrink-0">
                {visibleTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setPropsTab(tab.id)}
                    className={cn(
                      'flex-1 px-3 py-2 text-ice-xs font-medium transition-colors flex items-center justify-center gap-1.5',
                      activeTab === tab.id
                        ? tab.id === 'deploy'
                          ? 'text-ice-text-1 border-b-2 border-emerald-500'
                          : 'text-ice-text-1 border-b-2 border-ice-accent'
                        : 'text-ice-text-3 hover:text-ice-text-2',
                    )}
                  >
                    {tab.dot && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* ════ DEPLOY TAB ════ */}
            {activeTab === 'deploy' && hasDeployment && (
              <div className="pt-1">
                <DriftIndicator nodeId={selectedNode.id} />
                <Section title={t('properties.deploy.current')}>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-ice-xs text-emerald-500 font-medium">{t('properties.deploy.live')}</span>
                    </div>
                    {!!selectedNode.data?.url && (
                      <div>
                        <div className="text-ice-2xs text-ice-text-3 mb-0.5">{t('properties.deploy.urlLabel')}</div>
                        <a
                          href={selectedNode.data.url as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ice-xs text-blue-400 hover:underline break-all"
                        >
                          {selectedNode.data.url as string}
                        </a>
                      </div>
                    )}
                    {!!selectedNode.data?.deployed_image && (
                      <div>
                        <div className="text-ice-2xs text-ice-text-3 mb-0.5">{t('properties.deploy.imageLabel')}</div>
                        <div className="text-ice-xs text-ice-text-2 font-mono break-all">
                          {selectedNode.data.deployed_image as string}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="text-ice-2xs text-ice-text-3 mb-0.5">
                        {t('properties.deploy.resourceIdLabel')}
                      </div>
                      <div className="text-ice-xs text-ice-text-2 font-mono break-all">
                        {selectedNode.data.provider_id as string}
                      </div>
                    </div>
                    {!!selectedNode.data?.region && (
                      <div>
                        <div className="text-ice-2xs text-ice-text-3 mb-0.5">
                          {t('properties.deploy.regionLabel')}
                        </div>
                        <div className="text-ice-xs text-ice-text-2">{selectedNode.data.region as string}</div>
                      </div>
                    )}
                    {!!selectedNode.data?.max_instances && (
                      <div>
                        <div className="text-ice-2xs text-ice-text-3 mb-0.5">
                          {t('properties.deploy.instancesLabel')}
                        </div>
                        <div className="text-ice-xs text-ice-text-2">
                          {String(selectedNode.data.min_instances || 0)} – {String(selectedNode.data.max_instances)}
                        </div>
                      </div>
                    )}
                  </div>
                </Section>
                <DeployHistory cardId={activeCard.id} />
                <DriftCheckButton cardId={activeCard.id} nodes={activeCard.nodes} />
              </div>
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
                {iceType === 'Source.Repository' && (
                  <SourceRepositorySection
                    nodeRepo={nodeRepo}
                    nodeBranch={(selectedNode?.data?.branch as string) || 'main'}
                    buildCommand={(selectedNode?.data?.buildCommand as string) || ''}
                    outputDirectory={(selectedNode?.data?.outputDirectory as string) || ''}
                    onUpdateField={updateNodeField}
                    sourceNodeId={selectedNode!.id}
                    activeCard={activeCard}
                    activeEnvName={activeEnvName}
                  />
                )}
              </div>
            )}

            {/* ════ SCALING TAB ════ */}
            {activeTab === 'scaling' && isScalable && (
              <ScalingSection selectedNode={selectedNode} updateNodeField={updateNodeField} />
            )}

            {/* ════ DOMAIN TAB ════ */}
            {activeTab === 'domain' && iceType === 'Network.PublicEndpoint' && (
              <PublicEndpointDomainSection selectedNode={selectedNode} updateNodeField={updateNodeField} />
            )}

            {/* ════ CUSTOM DOMAIN — DOMAIN TAB ════ */}
            {activeTab === 'domain' && iceType === 'Network.CustomDomain' && (
              <CustomDomainPanel
                selectedNode={selectedNode}
                outgoingEdges={outgoingEdges}
                activeCard={activeCard}
                updateNodeField={updateNodeField}
                dispatch={dispatch}
              />
            )}

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
                  />
                )}

                {/* Source.Repository (when no tabs) */}
                {visibleTabs.length <= 1 && iceType === 'Source.Repository' && (
                  <SourceRepositorySection
                    nodeRepo={nodeRepo}
                    nodeBranch={(selectedNode?.data?.branch as string) || 'main'}
                    buildCommand={(selectedNode?.data?.buildCommand as string) || ''}
                    outputDirectory={(selectedNode?.data?.outputDirectory as string) || ''}
                    onUpdateField={updateNodeField}
                    sourceNodeId={selectedNode!.id}
                    activeCard={activeCard}
                    activeEnvName={activeEnvName}
                  />
                )}

                {/* Source (when no tabs) */}
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

                {/* Environment Variables */}
                {iceType === 'Config.Environment' && (
                  <EnvVarsEditor
                    variables={
                      (selectedNode?.data?.variables as Array<{ name: string; value: string; isSecret?: boolean }>) ||
                      []
                    }
                    onChange={(vars) => updateNodeField('variables', vars)}
                  />
                )}

                {/* Custom Domain — config tab mirrors the domain tab so
                    the user sees the root domain field + subdomain
                    routing list as soon as they click the block. */}
                {iceType === 'Network.CustomDomain' && (
                  <CustomDomainPanel
                    selectedNode={selectedNode}
                    outgoingEdges={outgoingEdges}
                    activeCard={activeCard}
                    updateNodeField={updateNodeField}
                    dispatch={dispatch}
                  />
                )}

                {/* Private Network — outbound internet (egress) policy */}
                {iceType === 'Network.PrivateNetwork' && (
                  <PrivateNetworkPanel selectedNode={selectedNode} updateNodeField={updateNodeField} />
                )}

                {/* Monitoring.Log — streaming mode + source override + status pill */}
                {iceType === 'Monitoring.Log' && <MonitoringLogSection nodeId={selectedNode!.id} />}

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
