/**
 * Properties Panel — Right Sidebar
 *
 * Properties are fetched from the core database (HIGH_LEVEL_CATEGORIES)
 * via window.api.resources IPC channel — not hardcoded.
 *
 * Shows:
 * 1. Nothing selected → Project overview (node count, cost estimate, card name)
 * 2. Node selected → Editable property fields from DB + scaling controls
 * 3. Edge selected → Relationship, protocol, port fields
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { getIcon, DEFAULT_ICON, type Provider } from '../../../assets/icons';
import { getBrandIcon } from '../../../assets/icons/brand-registry';
import { useTranslation, t } from '../../../i18n';
import { IceSelect } from '../../../shared/components/ui/ice-select';
import { PanelHeader } from '../../../shared/components/ui/panel-header';
import { cn } from '../../../shared/utils/cn';
import { DesignRequirements } from './design-requirements';
import {
  Section,
  SelectField,
  ListField,
  QueueListField,
  PropertyLabel,
  CustomValueInput,
} from './fields';
import { PropertyFields } from './fields/render-property-field';
import { ConnectionCard } from './sections/connection-card';
import { CustomDomainPanel } from './sections/custom-domain-panel';
import { DeployHistory } from './sections/deploy-history';
import { PublicEndpointDomainSection } from './sections/domain-section';
import { DriftIndicator, DriftCheckButton } from './sections/drift';
import { EdgePropertiesSection } from './sections/edge-properties-section';
import { EnvVarsEditor } from './sections/env-vars-editor';
import { GroupColorPicker } from './sections/group-color-picker';
import { MonitoringLogSection } from './sections/monitoring-log-section';
import { PipelineSection } from './sections/pipeline-section';
import { PrivateNetworkPanel } from './sections/private-network-panel';
import { ScalingSection } from './sections/scaling-section';
import { ServiceSourceSection } from './sections/service-source-section';
import { SourceRepositorySection } from './sections/source-repository-section';
import {
  selectActiveCard,
  updateCardNodeData,
  type CardNode,
  type CardEdge,
} from '../../../store/slices/cards-slice';
import { toggleProperties } from '../../../store/slices/ui-slice';
import { analyzeCanvasPatterns } from '../../canvas/utils/connection-rules';
import { useResourceMap, usePropertyIssues } from '../hooks/use-resource-map';
import type { RootState, AppDispatch } from '../../../store';

// ─── Cost parsing utility ──────────────────────────────────────────────────

function parseCostRange(cost: string): number {
  const matches = cost.match(/\$(\d+)(?:[–-](\d+))?/);
  if (!matches) return 0;
  const low = parseInt(matches[1]);
  const high = matches[2] ? parseInt(matches[2]) : low;
  return (low + high) / 2;
}

function formatCost(value: number): string {
  if (value === 0) return '';
  return `~$${Math.round(value)}/mo`;
}

// ResourceInfoPanel removed — IaC mapping, network ports, and about section
// were technical details that confused non-technical users

// ─── Main PropertiesPanel ────────────────────────────────────────────────────

export const PropertiesPanel: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const activeCard = useSelector(selectActiveCard);
  const { selectedNodes, selectedEdges } = useSelector((state: RootState) => state.selection);
  const validationIssues = useSelector((state: RootState) => state.validation?.issues ?? []);

  // ─── Properties tab state ──────────────────────────────────────────────────
  const [propsTab, setPropsTab] = useState<string>('config');

  // ─── Load resource schemas from core DB via IPC ───────────────────────────
  const resourceMap = useResourceMap();

  // Resolve selected node
  const selectedNodeId = selectedNodes[selectedNodes.length - 1] || null;
  const selectedNode: CardNode | undefined = useMemo(
    () => activeCard?.nodes.find((n) => n.id === selectedNodeId),
    [activeCard, selectedNodeId],
  );

  // Build per-property validation issues map for the selected node
  const propertyIssuesMap = usePropertyIssues(selectedNodeId);

  // Resolve active environment name
  const projectId = activeCard?.projectId || (selectedNode?.data?.projectId as string) || '';
  const activeEnvId = useSelector((s: RootState) => (projectId ? s.environments.activeEnvId[projectId] : undefined));
  const activeEnvs = useSelector((s: RootState) => (projectId ? s.environments.byProject[projectId] : undefined));
  const activeEnvName = activeEnvs?.find((e: any) => e.id === activeEnvId)?.name || 'production';

  // Resolve selected edge
  const selectedEdgeId = selectedEdges[selectedEdges.length - 1] || null;
  const selectedEdge: CardEdge | undefined = useMemo(
    () => activeCard?.edges.find((e) => e.id === selectedEdgeId),
    [activeCard, selectedEdgeId],
  );

  // Handlers for node data
  const updateNodeField = useCallback(
    (field: string, value: unknown) => {
      if (!selectedNodeId) return;
      dispatch(updateCardNodeData({ nodeId: selectedNodeId, data: { [field]: value } }));
    },
    [dispatch, selectedNodeId],
  );

  // Source tab state — "repo" or "image" (must be before any early returns for Rules of Hooks)
  const nodeRepo = (selectedNode?.data?.repository as string) || '';
  const nodeImage = (selectedNode?.data?.image as string) || '';
  const [, setSourceTab] = useState<'repo' | 'image'>(nodeImage && !nodeRepo ? 'image' : 'repo');

  // Sync tab when switching nodes
  useEffect(() => {
    setSourceTab(nodeImage && !nodeRepo ? 'image' : 'repo');
  }, [selectedNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Project-level stats (must be before any early returns to satisfy Rules of Hooks)
  const totalNodes = activeCard?.nodes.length || 0;
  const totalEdges = activeCard?.edges.length || 0;
  const totalCost = useMemo(() => {
    if (!activeCard) return 0;
    return activeCard.nodes.reduce((sum, n) => {
      const cost = (n.data?.estimatedCost as string) || '';
      return sum + parseCostRange(cost);
    }, 0);
  }, [activeCard]);

  // ═══ EDGE SELECTED ═══
  if (selectedEdge && activeCard) {
    return <EdgePropertiesSection selectedEdge={selectedEdge} activeCard={activeCard} />;
  }

  // ═══ NODE SELECTED ═══
  if (selectedNode && activeCard) {
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
    const brandIcon =
      getBrandIcon((selectedNode.data?.runtime as string) || '') || getBrandIcon(iceType) || getBrandIcon(label);
    const providerIcon = getIcon(iceType, (provider?.toLowerCase() || 'aws') as Provider);
    const iconUrl = brandIcon?.url || providerIcon?.icon || DEFAULT_ICON;

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
          const customDomainEdge = activeCard.edges.find((e: any) => {
            if (e.source !== selectedNode.id && e.target !== selectedNode.id) return false;
            const otherId = e.source === selectedNode.id ? e.target : e.source;
            const otherNode = activeCard.nodes.find((n: any) => n.id === otherId);
            return otherNode?.data?.iceType === 'Network.CustomDomain';
          });
          if (!customDomainEdge) return null;
          const otherId =
            customDomainEdge.source === selectedNode.id ? customDomainEdge.target : customDomainEdge.source;
          const cdNode = activeCard.nodes.find((n: any) => n.id === otherId);
          const cdLabel = (cdNode?.data?.label as string) || 'Custom Domain';
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
          const hasSource =
            (iceType.startsWith('Compute.') || iceType === 'Network.Gateway') && iceType !== 'Source.Repository';
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
  }

  // ═══ NOTHING SELECTED — Project Overview ═══
  return (
    <div id="ice-properties-panel" className="h-full flex flex-col bg-inherit border-l">
      <PanelHeader
        title={t('properties.title')}
        onClose={() => dispatch(toggleProperties())}
        closeLabel={t('properties.closeTitle')}
      />

      <Section title={t('properties.overview.title')}>
        <div className="flex items-center justify-between py-1">
          <span className="text-ice-sm text-ice-text-2">{t('properties.overview.nodes')}</span>
          <span className="text-ice-sm text-ice-text-1 font-mono">{totalNodes}</span>
        </div>
        <div className="flex items-center justify-between py-1">
          <span className="text-ice-sm text-ice-text-2">{t('properties.overview.connections')}</span>
          <span className="text-ice-sm text-ice-text-1 font-mono">{totalEdges}</span>
        </div>
        {totalCost > 0 && (
          <div className="flex items-center justify-between py-1">
            <span className="text-ice-sm text-ice-text-2">{t('properties.overview.estMonthlyCost')}</span>
            <span className="text-ice-sm text-emerald-400 font-mono">{formatCost(totalCost)}</span>
          </div>
        )}
      </Section>

      {/* Canvas pattern suggestions */}
      {activeCard &&
        activeCard.nodes.length > 0 &&
        (() => {
          const hints = analyzeCanvasPatterns(
            activeCard.nodes as Array<{ id: string; data?: Record<string, unknown> }>,
            activeCard.edges.map((e) => ({ source: e.source, target: e.target })),
          );
          if (hints.length === 0) return null;
          return (
            <Section title={t('properties.overview.suggestions')}>
              <div className="space-y-1.5">
                {hints.map((h, i) => (
                  <div key={i} className="rounded border border-blue-500/20 bg-blue-500/5 px-2.5 py-2">
                    <div className="text-ice-xs text-blue-400">{h.message}</div>
                  </div>
                ))}
              </div>
            </Section>
          );
        })()}

      {activeCard && activeCard.nodes.length === 0 && (
        <div className="flex-1 flex items-center justify-center px-6">
          <p className="text-ice-sm text-ice-text-3 text-center leading-relaxed">
            {t('properties.overview.emptyHint')}
          </p>
        </div>
      )}

      {activeCard && activeCard.nodes.length > 0 && (
        <div className="flex-1 flex items-center justify-center px-6">
          <p className="text-ice-sm text-ice-text-3 text-center leading-relaxed">
            {t('properties.overview.selectHint')}
          </p>
        </div>
      )}
    </div>
  );
};

