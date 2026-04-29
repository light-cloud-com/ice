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
import { getApi } from '../../../shared/api/api-adapter';
import { IceSelect } from '../../../shared/components/ui/ice-select';
import { PanelHeader } from '../../../shared/components/ui/panel-header';
import { cn } from '../../../shared/utils/cn';
import { DesignRequirements } from './design-requirements';
import {
  Section,
  TextField,
  SelectField,
  ListField,
  QueueListField,
  PropertyLabel,
  CustomValueInput,
} from './fields';
import { PropertyFields } from './fields/render-property-field';
import { ConnectionCard } from './sections/connection-card';
import { PublicEndpointDomainSection } from './sections/domain-section';
import { DriftIndicator, DriftCheckButton } from './sections/drift';
import { EnvVarsEditor } from './sections/env-vars-editor';
import { GroupColorPicker } from './sections/group-color-picker';
import { MonitoringLogSection } from './sections/monitoring-log-section';
import { ScalingSection } from './sections/scaling-section';
import {
  selectActiveCard,
  updateCardNodeData,
  updateCardEdgeData,
  deleteCardEdge,
  type CardNode,
  type CardEdge,
} from '../../../store/slices/cards-slice';
import { fetchGitHubBranches } from '../../../store/slices/integrations-slice';
import {
  fetchRulesForNode,
  fetchEventsForNode,
  createPipelineRule,
  updatePipelineRule,
  deletePipelineRule,
  type DeploymentRule,
  type DeploymentEvent,
  type DeployStep,
} from '../../../store/slices/pipeline-slice';
import { toggleProperties } from '../../../store/slices/ui-slice';
import { analyzeCanvasPatterns } from '../../canvas/utils/connection-rules';
import { RepoSelector } from '../../integrations/components/repo-selector';
import { useResourceMap, usePropertyIssues } from '../hooks/use-resource-map';
import { formatDeployRow } from '../utils/deploy-history-format';
import { computeEdgeWarnings, type EdgeWarning } from '../utils/edge-warnings';
import { formatAge } from '../utils/format-age';
import { normalizeSubdomain, validateSubdomain } from '../utils/normalize-subdomain';
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

  // Handlers for edge data
  const updateEdgeField = useCallback(
    (field: string, value: unknown) => {
      if (!selectedEdgeId) return;
      dispatch(updateCardEdgeData({ edgeId: selectedEdgeId, data: { [field]: value } }));
    },
    [dispatch, selectedEdgeId],
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
    const sourceNode = activeCard.nodes.find((n) => n.id === selectedEdge.source);
    const targetNode = activeCard.nodes.find((n) => n.id === selectedEdge.target);
    const sourceLabel = (sourceNode?.data?.label as string) || selectedEdge.source;
    const targetLabel = (targetNode?.data?.label as string) || selectedEdge.target;
    const edgeData = selectedEdge.data || {};
    const srcIceType = (sourceNode?.data?.iceType as string) || '';
    const tgtIceType = (targetNode?.data?.iceType as string) || '';

    // Compute validation warnings for this connection
    const edgeWarnings = computeEdgeWarnings(srcIceType, tgtIceType, t);

    return (
      <div id="ice-properties-panel" className="h-full flex flex-col bg-inherit overflow-y-auto">
        {/* Header */}
        <PanelHeader
          title={t('properties.title')}
          onClose={() => dispatch(toggleProperties())}
          closeLabel={t('properties.closeTitle')}
        />

        {/* Validation warnings */}
        {edgeWarnings.length > 0 && (
          <div className="px-3 pt-2 space-y-1.5">
            {edgeWarnings.map((w, i) => (
              <div key={i} className="rounded border border-amber-500/30 bg-amber-500/5 px-2.5 py-2">
                <div className="text-ice-xs text-amber-400 font-medium">{w.message}</div>
                {w.suggestion && <div className="text-ice-2xs text-ice-text-3 mt-0.5">{w.suggestion}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Visual source → target */}
        <div className="px-3 py-3 border-b border-ice-border">
          <div className="flex items-center gap-2">
            <div className="flex-1 text-center">
              <div className="text-ice-sm font-medium text-ice-text-1 truncate">{sourceLabel}</div>
              <div className="text-ice-2xs text-ice-text-3 font-mono truncate">
                {(sourceNode?.data?.iceType as string)?.split('.').pop() || 'node'}
              </div>
            </div>
            <div className="flex flex-col items-center shrink-0 gap-0.5">
              <div className="w-10 h-px bg-ice-border relative">
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-l-[5px] border-l-ice-text-3 border-y-[3px] border-y-transparent" />
              </div>
              {((edgeData.connectionCategory as string) || (edgeData.relationship as string)) && (
                <span className="text-ice-2xs text-ice-text-3 font-mono">
                  {(edgeData.connectionCategory as string) ||
                    ((edgeData.relationship as string) || '').replace('_', ' ')}
                </span>
              )}
            </div>
            <div className="flex-1 text-center">
              <div className="text-ice-sm font-medium text-ice-text-1 truncate">{targetLabel}</div>
              <div className="text-ice-2xs text-ice-text-3 font-mono truncate">
                {(targetNode?.data?.iceType as string)?.split('.').pop() || 'node'}
              </div>
            </div>
          </div>
        </div>

        {/* Properties */}
        <Section title={t('properties.edge.propertiesSection')}>
          {/* Subdomain — shown when either end of the edge is a
              Network.PublicEndpoint OR Network.CustomDomain, so users
              can route each service on a different host
              (api.example.com, app.example.com, etc.) without needing
              separate endpoint blocks. Empty = root. Validated against
              RFC 1035 DNS label rules: lowercase, digits, hyphens; no
              leading/trailing hyphen; ≤63 chars. */}
          {(srcIceType === 'Network.PublicEndpoint' ||
            tgtIceType === 'Network.PublicEndpoint' ||
            srcIceType === 'Network.CustomDomain' ||
            tgtIceType === 'Network.CustomDomain') &&
            (() => {
              const endpointNode =
                srcIceType === 'Network.PublicEndpoint' || srcIceType === 'Network.CustomDomain'
                  ? sourceNode
                  : targetNode;
              const rootDomain = ((endpointNode?.data?.domain as string) || '').trim();
              const currentSubdomain = (edgeData.subdomain as string) || '';

              const validationError = currentSubdomain ? validateSubdomain(currentSubdomain) : null;

              const previewHost =
                currentSubdomain && rootDomain ? `${currentSubdomain}.${rootDomain}` : rootDomain || '(no domain set)';
              return (
                <div className="space-y-1 mb-2">
                  <label className="text-ice-2xs text-ice-text-3">Subdomain</label>
                  <input
                    type="text"
                    value={currentSubdomain}
                    onChange={(e) => {
                      const cleaned = normalizeSubdomain(e.target.value);
                      updateEdgeField('subdomain', cleaned || null);
                    }}
                    placeholder="api (leave blank for root)"
                    className={cn(
                      'w-full px-1.5 py-1.5 text-ice-sm rounded border bg-ice-base text-ice-text-1 font-mono focus:outline-none focus:ring-1',
                      validationError
                        ? 'border-red-500/50 focus:ring-red-500'
                        : 'border-ice-border focus:ring-blue-500',
                    )}
                  />
                  {validationError ? (
                    <div className="text-ice-2xs text-red-400">{validationError}</div>
                  ) : (
                    <div className="text-ice-2xs text-ice-text-3 font-mono">→ {previewHost}</div>
                  )}
                </div>
              );
            })()}

          {/* Port — unified with env var when EnvVars block is connected */}
          {(() => {
            const sourceId = selectedEdge.source;
            const envNode = activeCard.nodes.find((n) => {
              if ((n.data?.iceType as string) !== 'Config.Environment') return false;
              return activeCard.edges.some(
                (e) => (e.source === sourceId && e.target === n.id) || (e.target === sourceId && e.source === n.id),
              );
            });
            const vars = (envNode?.data?.variables as Array<{ name: string; value: string }>) || [];
            const currentEnvVar = (edgeData.envVarName as string) || '';
            const currentPort = edgeData.port != null ? String(edgeData.port) : '';

            if (envNode) {
              return (
                <div className="space-y-1">
                  <label className="text-ice-2xs text-ice-text-3">{t('properties.edge.portLabel')}</label>
                  <div className="flex items-center gap-1">
                    <select
                      value={currentEnvVar}
                      onChange={(e) => {
                        const picked = e.target.value;
                        updateEdgeField('envVarName', picked || null);
                        if (picked) {
                          const match = vars.find((v) => v.name === picked);
                          if (match?.value && /^\d+$/.test(match.value.trim())) {
                            updateEdgeField('port', Number(match.value.trim()));
                          }
                        }
                      }}
                      className="flex-1 min-w-0 px-1.5 py-1.5 text-ice-sm rounded-l border border-ice-border bg-ice-base text-amber-400 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="" className="text-ice-text-1">
                        {t('properties.edge.customOption')}
                      </option>
                      {vars.map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                    <span className="text-ice-text-3 text-ice-sm">=</span>
                    <input
                      type="text"
                      value={currentPort}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateEdgeField('port', val ? Number(val) : null);
                        if (currentEnvVar && envNode) {
                          const updatedVars = [...vars];
                          const idx = updatedVars.findIndex((v) => v.name === currentEnvVar);
                          if (idx !== -1) {
                            updatedVars[idx] = { ...updatedVars[idx], value: val };
                            dispatch(updateCardNodeData({ nodeId: envNode.id, data: { variables: updatedVars } }));
                          }
                        }
                      }}
                      placeholder="5432"
                      className="w-20 px-1.5 py-1.5 text-ice-sm rounded-r border border-ice-border bg-ice-base text-ice-text-1 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              );
            }

            return (
              <TextField
                label={t('properties.edge.portLabel')}
                value={currentPort}
                placeholder="e.g. 5432"
                onChange={(v) => updateEdgeField('port', v ? Number(v) : null)}
              />
            );
          })()}
        </Section>

        {/* Delete */}
        <div className="px-3 mt-2">
          <button
            onClick={() => dispatch(deleteCardEdge(selectedEdge.id))}
            className="w-full py-1.5 text-ice-sm text-red-400 bg-red-950/30 border border-red-900/50 rounded hover:bg-red-950/50 transition-colors"
          >
            {t('properties.edge.deleteButton')}
          </button>
        </div>
      </div>
    );
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

// ─── Custom Domain Panel (inline in Properties panel) ──────────────────────
//
// Mirrors the canvas renderer ONE-TO-ONE: shows the same routes, in the
// same order, with the same subdomain edits. Both views read and write
// `selectedNode.data.routes` so editing in either place updates both.
//
// Layout:
//   - Root domain field — writes to `node.data.domain`
//   - Routes list — one row per route (NOT per edge); each row is:
//       · subdomain input (writes back to `routes[i].subdomain`)
//       · live host preview
//       · connected target label (or "—" if unconnected)
//       · delete button (only if more than one route)
//   - + Add subdomain route — appends a new route
//   - DNS records — pulled from any connected target's deploy outputs

interface CustomDomainRoute {
  id: string;
  subdomain: string;
}

const CustomDomainPanel: React.FC<{
  selectedNode: any;
  outgoingEdges: any[];
  activeCard: any;
  updateNodeField: (field: string, value: unknown) => void;
  dispatch: AppDispatch;
}> = ({ selectedNode, outgoingEdges, activeCard, updateNodeField, dispatch: _dispatch }) => {
  const rootDomain = (selectedNode?.data?.domain as string) || '';
  const routes = ((selectedNode?.data?.routes as CustomDomainRoute[] | undefined) || []).slice();

  // Build a per-route view: route + the connected edge (if any) + the
  // connected target node (if any) + DNS records from the target.
  const routeViews = routes.map((route) => {
    const matchingEdge = outgoingEdges.find((e) => (e.data as any)?.routeId === route.id);
    let targetNode: any = null;
    if (matchingEdge) {
      const targetId = matchingEdge.source === selectedNode.id ? matchingEdge.target : matchingEdge.source;
      targetNode = (activeCard.nodes || []).find((n: any) => n.id === targetId) || null;
    }
    const targetIce = (targetNode?.data?.iceType as string) || '';
    const targetLabel = (targetNode?.data?.label as string) || targetNode?.id?.slice(0, 8) || '';
    const targetId = targetNode?.id || '';
    const subdomain = (route.subdomain || '').trim();
    const host = subdomain && rootDomain ? `${subdomain}.${rootDomain}` : rootDomain;
    const dnsRecords = targetNode
      ? (((targetNode.data as any)?.custom_domain_dns_records ||
          (targetNode.data as any)?.deploy_outputs?.custom_domain_dns_records ||
          []) as Array<{ type: string; domain: string; value: string }>)
      : [];
    return { route, edge: matchingEdge, targetNode, targetIce, targetLabel, targetId, subdomain, host, dnsRecords };
  });

  const updateRouteSubdomain = (routeId: string, value: string) => {
    const next = routes.map((r) => (r.id === routeId ? { ...r, subdomain: normalizeSubdomain(value) } : r));
    updateNodeField('routes', next);
  };

  const addRoute = () => {
    const newId = `route-${Math.random().toString(36).slice(2, 10)}`;
    updateNodeField('routes', [...routes, { id: newId, subdomain: '' }]);
  };

  const deleteRoute = (routeId: string) => {
    updateNodeField(
      'routes',
      routes.filter((r) => r.id !== routeId),
    );
  };

  return (
    <div className="space-y-3">
      {/* Root domain field */}
      <Section title="Root domain">
        <input
          type="text"
          value={rootDomain}
          placeholder="example.com"
          onChange={(e) => updateNodeField('domain', e.target.value.toLowerCase().trim())}
          data-prop-key="domain"
          className="w-full px-2 py-1.5 text-ice-sm rounded border border-ice-border bg-ice-base text-ice-text-1 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <p className="mt-1 text-ice-2xs text-ice-text-3 leading-relaxed">
          The root domain for this block. Leave blank to disable. Add a route below for each subdomain you want to
          expose, then drag the matching dot on the canvas block to a publicly-facing service.
        </p>
      </Section>

      {/* Routes — same data the canvas block reads from */}
      <Section title={`Routes (${routeViews.length})`}>
        {routeViews.length === 0 && (
          <p className="text-ice-2xs text-ice-text-3 leading-relaxed py-2">
            No routes yet. Click + below to add a subdomain slot.
          </p>
        )}
        {routeViews.length > 0 && (
          <div className="space-y-2">
            {routeViews.map(({ route, edge, targetIce, targetLabel, targetId, subdomain, host }) => (
              <div key={route.id} className="rounded border border-ice-border bg-ice-base/40 px-2 py-2 space-y-1.5">
                {/* Top row: target label + live host preview */}
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-ice-2xs text-ice-text-3 truncate"
                    title={targetIce ? `${targetIce} · ${targetId}` : 'unconnected'}
                  >
                    {edge && targetId ? (
                      <>
                        → {targetLabel} <span className="text-ice-text-3/60">({targetId.slice(0, 8)})</span>
                      </>
                    ) : (
                      <span className="italic">unconnected — drag the dot to wire up</span>
                    )}
                  </span>
                  <span className="text-ice-2xs font-mono text-blue-400 truncate" title={host || '(no domain)'}>
                    {host || '(no domain)'}
                  </span>
                </div>

                {/* Bottom row: subdomain editor + delete */}
                <div className="flex items-center gap-1.5">
                  <span className="text-ice-2xs text-ice-text-3 shrink-0">subdomain</span>
                  <input
                    type="text"
                    value={subdomain}
                    placeholder="api (blank = root)"
                    onChange={(e) => updateRouteSubdomain(route.id, e.target.value)}
                    data-prop-key="routes.subdomain"
                    data-route-id={route.id}
                    className="flex-1 min-w-0 px-1.5 py-1 text-ice-xs rounded border border-ice-border bg-ice-base text-ice-text-1 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {routes.length > 1 && (
                    <button
                      onClick={() => deleteRoute(route.id)}
                      title="Delete route"
                      className="shrink-0 w-6 h-6 flex items-center justify-center text-ice-text-3 hover:text-red-400 hover:bg-red-500/10 rounded"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={addRoute}
          className="mt-2 w-full px-3 py-1.5 text-ice-xs text-ice-text-2 border border-dashed border-ice-border rounded hover:bg-ice-base/40"
        >
          + Add subdomain route
        </button>
      </Section>

      {/* DNS records (post-deploy) — split into ADD and REMOVE sections */}
      {(() => {
        type DnsRow = {
          type: string;
          domain: string;
          value: string;
          required_action?: string;
          host: string;
          targetLabel: string;
        };
        const allDnsRows: DnsRow[] = routeViews.flatMap((rv) =>
          rv.dnsRecords.map((rec) => ({
            ...(rec as any),
            host: rv.host || (rec as any).domain,
            targetLabel: rv.targetLabel,
          })),
        );
        const addRows = allDnsRows.filter((r) => (r.required_action || 'add') !== 'remove');
        const removeRows = allDnsRows.filter((r) => r.required_action === 'remove');

        if (allDnsRows.length === 0) {
          return (
            <Section title="DNS records">
              <p className="text-ice-2xs text-ice-text-3 leading-relaxed">
                After deploy, the DNS records you need to add at your registrar will appear here. Verify the domain at
                your DNS provider, and the connected service (e.g. Firebase Hosting) will automatically provision a
                managed SSL certificate.
              </p>
            </Section>
          );
        }

        const renderHeader = () => (
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-ice-text-3 px-2 pb-1">
            <span className="w-10 shrink-0">Type</span>
            <span className="flex-shrink min-w-0">Domain name</span>
            <span className="flex-1 min-w-0">Value</span>
            <span className="w-10 shrink-0" />
          </div>
        );

        const renderRow = (rec: DnsRow, i: number, palette: { bg: string; type: string; chip: string }) => (
          <div
            key={i}
            className={cn(
              'flex items-center gap-2 text-ice-2xs font-mono border border-ice-border px-2 py-1.5 rounded',
              palette.bg,
            )}
          >
            <span className={cn('font-semibold w-10 shrink-0', palette.type)}>{rec.type}</span>
            <span className="text-ice-text-3 truncate flex-shrink min-w-0" title={rec.host}>
              {rec.host}
            </span>
            <span className="text-ice-text-1 truncate flex-1 min-w-0" title={rec.value}>
              {rec.value}
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(rec.value).catch(() => undefined);
              }}
              className={cn('shrink-0 px-1.5 py-0.5 text-[10px] rounded', palette.chip)}
              title="Copy value to clipboard"
            >
              Copy
            </button>
          </div>
        );

        return (
          <Section title={`DNS records (${allDnsRows.length})`}>
            {addRows.length > 0 && (
              <div className="space-y-1">
                <div className="text-ice-2xs text-blue-400 leading-relaxed">
                  Add the records below at your DNS provider to verify the domain.
                </div>
                {renderHeader()}
                {addRows.map((rec, i) =>
                  renderRow(rec, i, {
                    bg: 'bg-ice-base/40',
                    type: 'text-blue-400',
                    chip: 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300',
                  }),
                )}
              </div>
            )}

            {removeRows.length > 0 && (
              <div className="space-y-1 mt-3">
                <div className="text-ice-2xs text-amber-400 leading-relaxed">
                  Remove the records below from your DNS provider — they conflict with the new configuration and block
                  verification.
                </div>
                {renderHeader()}
                {removeRows.map((rec, i) =>
                  renderRow(rec, i, {
                    bg: 'bg-amber-500/5',
                    type: 'text-amber-400',
                    chip: 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300',
                  }),
                )}
              </div>
            )}

            <p className="mt-2 text-ice-2xs text-ice-text-3 leading-relaxed">
              After the records propagate (usually a few minutes), Firebase Hosting will issue a managed SSL certificate
              automatically.
            </p>
          </Section>
        );
      })()}
    </div>
  );
};

// ─── Private Network — Inbound + Outbound internet sections ────────────────
//
// Controls the ingress and egress policies for services nested inside a
// PrivateNetwork. The two policies are independent — a Sealed (ingress =
// 'none') network can still have outbound, and an Open (ingress = 'all')
// one can still be egress-restricted.
//
// Labels bridge technical and mental models: "Allow all (Open)", etc.

type PrivateNetworkPolicy = 'all' | 'allowlist' | 'none';

interface PolicySectionProps {
  title: string;
  hint: string;
  direction: 'inbound' | 'outbound';
  policyField: string;
  allowlistField: string;
  value: PrivateNetworkPolicy;
  allowlist: string[];
  entryPlaceholder: string;
  options: Array<{ value: PrivateNetworkPolicy; label: string; hint: string }>;
  updateNodeField: (field: string, value: unknown) => void;
}

const PrivateNetworkPolicySection: React.FC<PolicySectionProps> = ({
  title,
  hint,
  direction,
  policyField,
  allowlistField,
  value,
  allowlist,
  entryPlaceholder,
  options,
  updateNodeField,
}) => {
  const setPolicy = (next: PrivateNetworkPolicy) => updateNodeField(policyField, next);

  const updateEntry = (index: number, entry: string) => {
    const next = allowlist.slice();
    next[index] = entry;
    updateNodeField(allowlistField, next);
  };

  const addEntry = () => updateNodeField(allowlistField, [...allowlist, '']);

  const removeEntry = (index: number) =>
    updateNodeField(
      allowlistField,
      allowlist.filter((_, i) => i !== index),
    );

  return (
    <Section title={title}>
      <p className="px-2 pb-1 text-ice-2xs text-ice-text-3 leading-relaxed">{hint}</p>
      <div className="space-y-0.5">
        {options.map((opt) => (
          <label
            key={opt.value}
            data-testid={`pn-${direction}-${opt.value}`}
            className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-ice-hover cursor-pointer"
          >
            <input
              type="radio"
              name={`private-network-${direction}`}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => setPolicy(opt.value)}
              className="mt-0.5 accent-red-500"
            />
            <div className="flex-1 min-w-0">
              <div className="text-ice-xs text-ice-text-1">{opt.label}</div>
              <div className="text-ice-2xs text-ice-text-3 leading-snug">{opt.hint}</div>
            </div>
          </label>
        ))}
      </div>

      {value === 'allowlist' && (
        <div className="mt-2 px-2 space-y-1">
          <div className="text-ice-2xs text-ice-text-3">
            {direction === 'inbound' ? 'Allowed sources' : 'Allowed destinations'}
          </div>
          {allowlist.length === 0 && (
            <div className="text-ice-2xs text-ice-text-3/50 italic py-1">No entries yet. Click + below to add one.</div>
          )}
          {allowlist.map((entry, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                type="text"
                value={entry}
                onChange={(e) => updateEntry(i, e.target.value)}
                placeholder={entryPlaceholder}
                data-testid={`pn-${direction}-allowlist-entry-${i}`}
                className="flex-1 min-w-0 bg-transparent border-b border-ice-border/50 px-1 py-0.5 text-ice-xs font-mono text-ice-text-1 outline-none focus:border-ice-accent transition-colors placeholder:text-ice-text-3/40"
              />
              <button
                onClick={() => removeEntry(i)}
                className="p-0.5 text-ice-text-3/40 hover:text-red-400 transition-colors text-ice-xs"
                aria-label={direction === 'inbound' ? 'Remove source' : 'Remove destination'}
              >
                &times;
              </button>
            </div>
          ))}
          <button
            onClick={addEntry}
            data-testid={`pn-${direction}-allowlist-add`}
            className="mt-1 text-ice-2xs text-ice-text-3/60 hover:text-ice-accent transition-colors"
          >
            + Add {direction === 'inbound' ? 'source' : 'destination'}
          </button>
        </div>
      )}
    </Section>
  );
};

const PrivateNetworkPanel: React.FC<{
  selectedNode: any;
  updateNodeField: (field: string, value: unknown) => void;
}> = ({ selectedNode, updateNodeField }) => {
  const ingress = ((selectedNode?.data?.ingress as PrivateNetworkPolicy) || 'all') as PrivateNetworkPolicy;
  const ingressAllowlist = ((selectedNode?.data?.ingressAllowlist as string[] | undefined) || []).slice();
  const egress = ((selectedNode?.data?.egress as PrivateNetworkPolicy) || 'all') as PrivateNetworkPolicy;
  const egressAllowlist = ((selectedNode?.data?.egressAllowlist as string[] | undefined) || []).slice();

  return (
    <div className="space-y-3">
      <PrivateNetworkPolicySection
        title="Inbound internet"
        hint="Controls who on the public internet can reach services inside this network. Independent from the outbound policy below."
        direction="inbound"
        policyField="ingress"
        allowlistField="ingressAllowlist"
        value={ingress}
        allowlist={ingressAllowlist}
        entryPlaceholder="203.0.113.0/24 or 1.2.3.4"
        options={[
          { value: 'all', label: 'Allow all inbound (Open)', hint: 'Public reachable. Default.' },
          {
            value: 'allowlist',
            label: 'Allowlist specific sources (Restricted)',
            hint: 'Only listed source ranges or IPs can reach in.',
          },
          {
            value: 'none',
            label: 'Block all inbound (Sealed)',
            hint: 'Internal only. Services inside talk east-west.',
          },
        ]}
        updateNodeField={updateNodeField}
      />

      <PrivateNetworkPolicySection
        title="Outbound internet"
        hint="Controls whether services inside this network can reach the public internet. Independent from the inbound policy above."
        direction="outbound"
        policyField="egress"
        allowlistField="egressAllowlist"
        value={egress}
        allowlist={egressAllowlist}
        entryPlaceholder="api.stripe.com or 10.0.0.0/8"
        options={[
          { value: 'all', label: 'Allow all outbound', hint: 'Services can call any public URL. Default.' },
          {
            value: 'allowlist',
            label: 'Allowlist specific destinations',
            hint: 'Only listed hostnames or IP ranges are reachable.',
          },
          { value: 'none', label: 'Block all outbound', hint: 'Air-gapped. No public internet access.' },
        ]}
        updateNodeField={updateNodeField}
      />
    </div>
  );
};

// ─── Pipeline Section (inline in Properties panel) ──────────────────────────

const PipelineSection: React.FC<{
  cardId: string;
  nodeId: string;
  nodeRepo: string;
  activeCard: any;
}> = ({ cardId, nodeId, nodeRepo, activeCard }) => {
  const dispatch = useDispatch<AppDispatch>();
  const key = `${cardId}:${nodeId}`;
  const rules = useSelector((s: RootState) => s.pipeline.rules[key] || []);
  const rulesLoaded = useSelector((s: RootState) => key in s.pipeline.rules);
  const rulesLoading = useSelector((s: RootState) => s.pipeline.rulesLoading);
  const events = useSelector((s: RootState) => s.pipeline.history[key] || []);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Resolve repository from this node or a connected Source.Repository block
  let repository = nodeRepo;
  if (!repository && activeCard && nodeId) {
    const edges = (activeCard.edges || []) as Array<{ source: string; target: string }>;
    const connectedEdges = edges.filter((e: any) => e.source === nodeId || e.target === nodeId);
    for (const edge of connectedEdges) {
      const otherId = edge.source === nodeId ? edge.target : edge.source;
      const otherNode = (activeCard.nodes || []).find((n: any) => n.id === otherId);
      if (otherNode?.data?.iceType === 'Source.Repository' || otherNode?.data?.behavior === 'source') {
        repository = (otherNode.data.repository as string) || '';
        break;
      }
    }
  }

  const branches = useSelector((s: RootState) => (repository ? s.integrations.github.branches[repository] || [] : []));

  // Fetch rules + branches on mount
  useEffect(() => {
    if (!cardId || !nodeId) return;
    dispatch(fetchRulesForNode({ cardId, nodeId }));
    dispatch(fetchEventsForNode({ cardId, nodeId }));
    if (repository && branches.length === 0) {
      dispatch(fetchGitHubBranches(repository));
    }
  }, [cardId, nodeId, repository, branches.length, dispatch]);

  // Auto-create default rule when rules load empty
  const [autoCreated, setAutoCreated] = useState(false);
  useEffect(() => {
    if (!repository || !rulesLoaded || autoCreated || rules.length > 0) return;
    setAutoCreated(true);
    const defaultBranch = branches.find((b) => b.name === 'main')
      ? 'main'
      : branches.find((b) => b.name === 'master')
        ? 'master'
        : branches[0]?.name || 'main';

    dispatch(
      createPipelineRule({
        cardId,
        nodeId,
        repository,
        branchPattern: defaultBranch,
        environment: 'production',
      }),
    )
      .then(() => dispatch(fetchRulesForNode({ cardId, nodeId })))
      .catch((err: any) => console.error('[Pipeline] Auto-create failed:', err));
  }, [repository, rulesLoaded, rules.length, autoCreated, branches, cardId, dispatch, nodeId]);

  // No repo connected → don't show the section
  if (!repository) return null;

  const handleAddRule = () => {
    const usedBranches = new Set(rules.map((r) => r.branch_pattern));
    const unused = branches.find((b) => !usedBranches.has(b.name));
    const branchName = unused?.name || 'develop';
    const env =
      branchName === 'main' || branchName === 'master'
        ? 'production'
        : branchName.includes('stag')
          ? 'staging'
          : 'development';

    dispatch(
      createPipelineRule({
        cardId,
        nodeId,
        repository,
        branchPattern: branchName,
        environment: env,
      }),
    ).then(() => dispatch(fetchRulesForNode({ cardId, nodeId })));
  };

  const handleRetry = (eventId: string) => {
    import('../../../store/slices/pipeline-slice').then(({ default: _, ..._mod }) => {
      // retryDeploy is on the API adapter, not a thunk — call it directly
      import('../../../shared/api/api-adapter').then(({ getApi }) => {
        getApi()
          .pipeline.retryDeploy(eventId)
          .then(() => {
            dispatch(fetchEventsForNode({ cardId, nodeId }));
          });
      });
    });
  };

  return (
    <Section title={t('pipeline.serviceDeploys')}>
      {/* Loading */}
      {(rulesLoading || (autoCreated && rules.length === 0)) && (
        <div className="text-ice-xs text-ice-text-3 py-1">{t('pipeline.settingUp')}</div>
      )}

      {/* Trigger rules */}
      {rules.length > 0 && (
        <div className="space-y-1.5">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`flex items-center gap-1.5 text-ice-xs rounded border px-2 py-1.5 ${
                rule.enabled ? 'border-ice-border bg-ice-raised' : 'border-ice-border/50 opacity-50'
              }`}
            >
              {/* Toggle */}
              <button
                onClick={() => dispatch(updatePipelineRule({ ruleId: rule.id, updates: { enabled: !rule.enabled } }))}
                className={`w-6 h-3.5 rounded-full relative shrink-0 transition-colors ${rule.enabled ? 'bg-emerald-500' : 'bg-ice-border'}`}
              >
                <div
                  className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform ${rule.enabled ? 'left-3' : 'left-0.5'}`}
                />
              </button>

              <span className="text-ice-text-3">{t('pipeline.push')}</span>

              {/* Branch */}
              <select
                value={rule.branch_pattern}
                onChange={(e) =>
                  dispatch(updatePipelineRule({ ruleId: rule.id, updates: { branchPattern: e.target.value } }))
                }
                className="px-1 py-0.5 text-ice-xs rounded border border-ice-border bg-ice-base text-ice-text-1 font-mono max-w-[80px]"
              >
                {branches.length > 0 ? (
                  <>
                    {branches.map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                    <option value="*">*</option>
                  </>
                ) : (
                  <>
                    <option value={rule.branch_pattern}>{rule.branch_pattern}</option>
                    <option value="*">*</option>
                  </>
                )}
              </select>

              <span className="text-ice-text-3">&rarr;</span>

              {/* Environment */}
              <select
                value={rule.environment}
                onChange={(e) =>
                  dispatch(updatePipelineRule({ ruleId: rule.id, updates: { environment: e.target.value } }))
                }
                className="px-1 py-0.5 text-ice-xs rounded border border-ice-border bg-ice-base text-ice-text-1 max-w-[85px]"
              >
                <option value="production">{t('pipeline.envProduction')}</option>
                <option value="staging">{t('pipeline.envStaging')}</option>
                <option value="development">{t('pipeline.envDevelopment')}</option>
              </select>

              {/* Delete */}
              <button
                onClick={() =>
                  dispatch(deletePipelineRule({ ruleId: rule.id, cardId: rule.card_id, nodeId: rule.node_id }))
                }
                className="ml-auto text-ice-text-3 hover:text-red-400 transition-colors"
                title={t('pipeline.removeTrigger')}
              >
                &times;
              </button>
            </div>
          ))}

          {/* Add trigger */}
          <button onClick={handleAddRule} className="text-ice-xs text-ice-text-3 hover:text-blue-400 transition-colors">
            {t('pipeline.addTrigger')}
          </button>
        </div>
      )}

      {/* Recent deployments with expandable logs */}
      {events.length > 0 && (
        <div className="mt-2 pt-2 border-t border-ice-border space-y-1">
          <div className="text-ice-xs text-ice-text-3 font-semibold uppercase tracking-wider mb-1">
            {t('pipeline.recent')}
          </div>
          {events.slice(0, 5).map((ev) => {
            const isExpanded = expandedEventId === ev.id;
            const logs = (ev.deployment_logs || []) as DeployStep[];
            return (
              <div key={ev.id} className="rounded border border-ice-border overflow-hidden">
                <div
                  className="flex items-center gap-1.5 text-ice-xs px-2 py-1.5 cursor-pointer hover:bg-ice-hover transition-colors"
                  onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      ev.status === 'success'
                        ? 'bg-emerald-500'
                        : ev.status === 'failed'
                          ? 'bg-red-500'
                          : ev.status === 'building' || ev.status === 'deploying'
                            ? 'bg-blue-500 animate-pulse'
                            : ev.status === 'cancelled'
                              ? 'bg-ice-text-3'
                              : 'bg-ice-text-3'
                    }`}
                  />
                  <span className="font-mono text-ice-text-2">{ev.commit_sha?.slice(0, 7)}</span>
                  <span className="text-ice-text-3 truncate flex-1">{ev.commit_message}</span>
                  <span className="text-ice-text-3 shrink-0">{formatAge(ev.started_at)}</span>
                  <span className={`shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>&#9662;</span>
                </div>

                {/* Expanded log viewer */}
                {isExpanded && (
                  <div className="border-t border-ice-border bg-slate-950 px-2 py-1.5 space-y-0.5 max-h-28 overflow-y-auto">
                    {logs.length > 0 ? (
                      logs.map((log, i) => (
                        <div key={i} className="flex items-center gap-1 text-ice-2xs font-mono">
                          <span
                            className={`shrink-0 ${
                              log.status === 'completed'
                                ? 'text-emerald-500'
                                : log.status === 'failed'
                                  ? 'text-red-400'
                                  : 'text-blue-400'
                            }`}
                          >
                            {log.status === 'completed' ? '\u2713' : log.status === 'failed' ? '\u2717' : '\u25CF'}
                          </span>
                          <span className={log.status === 'failed' ? 'text-red-400' : 'text-slate-300'}>
                            {log.message}
                          </span>
                          {log.duration_ms != null && (
                            <span className="ml-auto text-slate-500">{(log.duration_ms / 1000).toFixed(1)}s</span>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-ice-2xs font-mono text-slate-500">{t('pipeline.noLogs')}</div>
                    )}
                    {ev.error && (
                      <div className="text-ice-2xs font-mono text-red-400 pt-1 border-t border-slate-800">
                        {ev.error}
                      </div>
                    )}
                    {ev.duration_seconds != null && (
                      <div className="text-ice-2xs font-mono text-slate-500 pt-0.5">
                        {ev.duration_seconds < 60
                          ? `${ev.duration_seconds}s`
                          : `${Math.floor(ev.duration_seconds / 60)}m ${ev.duration_seconds % 60}s`}
                      </div>
                    )}
                    {/* Retry button for failed deploys */}
                    {ev.status === 'failed' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetry(ev.id);
                        }}
                        className="mt-1 px-2 py-0.5 text-ice-2xs font-medium rounded bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                      >
                        {t('common.buttons.retry')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
};

// ─── Service Source Section (read-only — shows linked repo or hint) ──────────

const ServiceSourceSection: React.FC<{
  nodeId: string;
  nodeRepo: string;
  nodeBranch: string;
  activeCard: any;
}> = ({ nodeId, nodeRepo, nodeBranch, activeCard }) => {
  // Find connected Source.Repository block
  let linkedRepo = nodeRepo;
  let linkedBranch = nodeBranch;
  let sourceBlockName = '';

  if (activeCard) {
    const edges = (activeCard.edges || []) as Array<{ source: string; target: string }>;
    const connected = edges.filter((e: any) => e.source === nodeId || e.target === nodeId);
    for (const edge of connected) {
      const otherId = edge.source === nodeId ? edge.target : edge.source;
      const otherNode = (activeCard.nodes || []).find((n: any) => n.id === otherId);
      if (otherNode?.data?.iceType === 'Source.Repository' || otherNode?.data?.behavior === 'source') {
        linkedRepo = (otherNode.data.repository as string) || linkedRepo;
        linkedBranch = (otherNode.data.branch as string) || linkedBranch;
        sourceBlockName = (otherNode.data.label as string) || 'GitHub Repo';
        break;
      }
    }
  }

  if (linkedRepo) {
    return (
      <Section title={t('properties.source.title')}>
        <div className="rounded border border-ice-border bg-ice-raised px-2.5 py-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-ice-sm font-mono text-ice-text-1">{linkedRepo}</span>
          </div>
          {linkedBranch && <div className="text-ice-xs text-ice-text-3 font-mono">&rarr; {linkedBranch}</div>}
          {sourceBlockName && (
            <div className="text-ice-xs text-ice-text-3">
              {t('properties.source.managedBy')} <span className="text-ice-text-2 font-medium">{sourceBlockName}</span>{' '}
              {t('properties.source.block')}
            </div>
          )}
        </div>
      </Section>
    );
  }

  return (
    <Section title={t('properties.source.title')}>
      <div className="rounded border border-dashed border-ice-border px-2.5 py-3 text-center space-y-1.5">
        <div className="text-ice-sm text-ice-text-3">{t('properties.source.noSourceConnected')}</div>
        <div className="text-ice-xs text-ice-text-3 leading-relaxed">{t('properties.source.noSourceHint')}</div>
      </div>
    </Section>
  );
};

// ─── Source.Repository Section (repo + branch + build + triggers) ────────────

const SourceRepositorySection: React.FC<{
  nodeRepo: string;
  nodeBranch: string;
  buildCommand: string;
  outputDirectory: string;
  onUpdateField: (field: string, value: unknown) => void;
  sourceNodeId: string;
  activeCard: any;
  activeEnvName: string;
}> = ({
  nodeRepo,
  nodeBranch,
  buildCommand,
  outputDirectory,
  onUpdateField,
  sourceNodeId,
  activeCard,
  activeEnvName,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const branches = useSelector((s: RootState) => (nodeRepo ? s.integrations.github.branches[nodeRepo] || [] : []));
  const pipelineNodeStatus = useSelector((s: RootState) => s.pipeline.nodeStatus);

  // Find connected service nodes (deploy targets)
  const connectedServices = useMemo(() => {
    if (!activeCard || !sourceNodeId) return [];
    const edges = (activeCard.edges || []) as Array<{ source: string; target: string }>;
    const connected = edges.filter((e: any) => e.source === sourceNodeId || e.target === sourceNodeId);
    const services: Array<{ id: string; label: string }> = [];
    for (const edge of connected) {
      const otherId = edge.source === sourceNodeId ? edge.target : edge.source;
      const otherNode = (activeCard.nodes || []).find((n: any) => n.id === otherId);
      if (otherNode && otherNode.type === 'resource') {
        const otherIceType = (otherNode.data?.iceType as string) || '';
        if (!otherIceType.startsWith('Source.')) {
          services.push({
            id: otherNode.id,
            label: (otherNode.data?.label as string) || otherNode.id.slice(0, 8),
          });
        }
      }
    }
    return services;
  }, [activeCard, sourceNodeId]);

  // Fetch branches when repo changes
  useEffect(() => {
    if (nodeRepo && branches.length === 0) {
      dispatch(fetchGitHubBranches(nodeRepo));
    }
  }, [nodeRepo, branches.length, dispatch]);

  // Load rules for each connected service
  const cardId = activeCard?.id || '';
  useEffect(() => {
    for (const svc of connectedServices) {
      dispatch(fetchRulesForNode({ cardId, nodeId: svc.id }));
      dispatch(fetchEventsForNode({ cardId, nodeId: svc.id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- use .length to avoid re-firing on array reference changes
  }, [connectedServices.length, cardId, dispatch]);

  // Aggregate rules for all connected services
  const allRules = useSelector((s: RootState) => {
    const result: Array<DeploymentRule & { _serviceName: string }> = [];
    for (const svc of connectedServices) {
      const key = `${cardId}:${svc.id}`;
      const rules = s.pipeline.rules[key] || [];
      for (const r of rules) {
        result.push({ ...r, _serviceName: svc.label });
      }
    }
    return result;
  });

  const allEvents = useSelector((s: RootState) => {
    const result: DeploymentEvent[] = [];
    for (const svc of connectedServices) {
      const key = `${cardId}:${svc.id}`;
      const events = s.pipeline.history[key] || [];
      result.push(...events);
    }
    return result.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  });

  // Check if rules have loaded for at least one service
  const anyRulesLoaded = useSelector((s: RootState) =>
    connectedServices.some((svc) => `${cardId}:${svc.id}` in s.pipeline.rules),
  );

  // Auto-create default rule for first connected service if none exist
  const [autoCreated, setAutoCreated] = useState(false);
  useEffect(() => {
    if (!nodeRepo || !anyRulesLoaded || autoCreated || allRules.length > 0 || connectedServices.length === 0) return;
    setAutoCreated(true);
    const defaultBranch = branches.find((b) => b.name === 'main')
      ? 'main'
      : branches.find((b) => b.name === 'master')
        ? 'master'
        : branches[0]?.name || 'main';
    const targetService = connectedServices[0];

    dispatch(
      createPipelineRule({
        cardId,
        nodeId: targetService.id,
        repository: nodeRepo,
        branchPattern: defaultBranch,
        environment: activeEnvName,
        buildCommand: buildCommand || undefined,
        installCommand: undefined,
        outputDir: outputDirectory || undefined,
      }),
    )
      .then(() => dispatch(fetchRulesForNode({ cardId, nodeId: targetService.id })))
      .catch((err: any) => console.error('[Pipeline] Auto-create failed:', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- use .length for arrays to avoid re-firing on reference changes; autoCreated guard prevents loops
  }, [
    nodeRepo,
    anyRulesLoaded,
    allRules.length,
    autoCreated,
    branches.length,
    connectedServices.length,
    cardId,
    dispatch,
    activeEnvName,
    buildCommand,
    outputDirectory,
  ]);

  const handleAddRule = (serviceId: string) => {
    // Find branches not already used for this env + service
    const envRulesForService = allRules.filter((r) => r.node_id === serviceId && r.environment === activeEnvName);
    const usedBranches = new Set(envRulesForService.map((r) => r.branch_pattern));
    const unused = branches.find((b) => !usedBranches.has(b.name));
    const branchName = unused?.name || 'main';

    dispatch(
      createPipelineRule({
        cardId,
        nodeId: serviceId,
        repository: nodeRepo,
        branchPattern: branchName,
        environment: activeEnvName,
        buildCommand: buildCommand || undefined,
        outputDir: outputDirectory || undefined,
      }),
    ).then(() => dispatch(fetchRulesForNode({ cardId, nodeId: serviceId })));
  };

  return (
    <>
      {/* Repository */}
      <Section title={t('properties.source.repository')}>
        <RepoSelector
          value={nodeRepo}
          onChange={(repo) => {
            onUpdateField('repository', repo);
            if (repo && repo !== nodeRepo) {
              onUpdateField('branch', 'main');
              dispatch(fetchGitHubBranches(repo));
            }
          }}
        />
      </Section>

      {/* Branch */}
      {nodeRepo && (
        <Section title={t('properties.source.branch')}>
          <select
            value={nodeBranch}
            onChange={(e) => onUpdateField('branch', e.target.value)}
            data-prop-key="branch"
            className="w-full px-2 py-1.5 text-ice-sm rounded border border-ice-border bg-ice-base text-ice-text-1 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {branches.length > 0 ? (
              branches.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                  {b.protected ? ` ${t('properties.source.branchProtected')}` : ''}
                </option>
              ))
            ) : (
              <>
                <option value={nodeBranch}>{nodeBranch}</option>
                {nodeBranch !== 'main' && <option value="main">main</option>}
                {nodeBranch !== 'master' && <option value="master">master</option>}
              </>
            )}
          </select>
        </Section>
      )}

      {/* Build */}
      {nodeRepo && (
        <Section title={t('properties.source.build')}>
          <div className="space-y-2">
            <TextField
              label={t('properties.source.buildCommand')}
              value={buildCommand}
              placeholder={t('properties.source.buildCommandPlaceholder')}
              onChange={(v) => onUpdateField('buildCommand', v)}
              propKey="buildCommand"
            />
            <TextField
              label={t('properties.source.outputDirectory')}
              value={outputDirectory}
              placeholder={t('properties.source.outputDirPlaceholder')}
              onChange={(v) => onUpdateField('outputDirectory', v)}
              propKey="outputDirectory"
            />
          </div>
        </Section>
      )}

      {/* Triggers — filtered to active environment only */}
      {nodeRepo &&
        connectedServices.length > 0 &&
        (() => {
          const envRules = allRules.filter((r) => r.environment === activeEnvName);

          return (
            <Section title={`Triggers · ${activeEnvName}`}>
              {envRules.length === 0 && autoCreated && (
                <div className="text-ice-xs text-ice-text-3 py-1">{t('pipeline.settingUp')}</div>
              )}

              {envRules.length === 0 && !autoCreated && (
                <div className="text-ice-xs text-ice-text-3 py-1">{t('pipeline.noTriggersForEnv')}</div>
              )}

              {/* One row per connected service — toggle + trigger type + branch (read-only) + service name */}
              {connectedServices.map((svc) => {
                const svcRule = envRules.find((r) => r.node_id === svc.id);
                return (
                  <div
                    key={svc.id}
                    className={`flex items-center gap-1.5 text-ice-xs rounded border px-2 py-1.5 ${
                      svcRule?.enabled ? 'border-ice-border bg-ice-raised' : 'border-ice-border/50 opacity-50'
                    }`}
                  >
                    <span className={`text-ice-xs ${!svcRule?.enabled ? 'text-ice-text-1' : 'text-ice-text-3'}`}>
                      {t('pipeline.manual')}
                    </span>

                    {/* Toggle */}
                    <button
                      onClick={() => {
                        if (svcRule) {
                          dispatch(updatePipelineRule({ ruleId: svcRule.id, updates: { enabled: !svcRule.enabled } }));
                        } else {
                          handleAddRule(svc.id);
                        }
                      }}
                      className={`w-6 h-3.5 rounded-full relative shrink-0 transition-colors ${svcRule?.enabled ? 'bg-emerald-500' : 'bg-ice-border'}`}
                    >
                      <div
                        className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform ${svcRule?.enabled ? 'left-3' : 'left-0.5'}`}
                      />
                    </button>

                    <span className={`text-ice-xs ${svcRule?.enabled ? 'text-emerald-500' : 'text-ice-text-3'}`}>
                      {t('pipeline.auto')}
                    </span>

                    {/* Deploy button — always visible for manual trigger */}
                    {svcRule && !svcRule.enabled && (
                      <button
                        onClick={() => {
                          import('../../../store/slices/pipeline-slice').then(({ triggerManualDeploy }) => {
                            dispatch(triggerManualDeploy({ ruleId: svcRule.id }));
                          });
                        }}
                        className="ml-auto px-2 py-0.5 text-ice-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium"
                      >
                        {t('common.buttons.deploy')}
                      </button>
                    )}
                  </div>
                );
              })}
            </Section>
          );
        })()}

      {/* No services connected hint */}
      {nodeRepo && connectedServices.length === 0 && (
        <Section title={t('pipeline.triggers')}>
          <div className="text-ice-xs text-ice-text-3">{t('properties.noServiceHint')}</div>
        </Section>
      )}

      {/* Live build output — shows during active pipeline */}
      {connectedServices.length > 0 &&
        (() => {
          const activeStatuses = connectedServices
            .map((svc) => ({ svc, status: pipelineNodeStatus[svc.id] }))
            .filter(
              ({ status }) =>
                status && (status.status === 'building' || status.status === 'deploying' || status.status === 'queued'),
            );

          if (activeStatuses.length === 0) return null;

          return (
            <Section title={t('pipeline.liveBuild')}>
              <div className="rounded border border-ice-border bg-slate-950 p-2 max-h-32 overflow-y-auto font-mono text-ice-2xs leading-relaxed space-y-0.5">
                {activeStatuses.map(({ svc, status }) => {
                  // Elapsed time since build started
                  const elapsed = status!.startedAt
                    ? Math.round((Date.now() - new Date(status!.startedAt).getTime()) / 1000)
                    : 0;
                  const timeStr =
                    elapsed > 0 ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}` : '';
                  const timeoutWarn = elapsed > 240; // warn at 4 min (5 min limit)

                  return (
                    <div key={svc.id}>
                      <div className="text-blue-400 flex items-center gap-1 mb-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
                        {svc.label} — {status!.stage || status!.status}
                        {timeStr && (
                          <span className={`ml-auto ${timeoutWarn ? 'text-amber-400' : 'text-slate-500'}`}>
                            {timeStr}
                            {timeoutWarn ? ` ${t('pipeline.timeoutSoon')}` : ''}
                          </span>
                        )}
                      </div>
                      {status!.stage && status!.stage.startsWith('[') && (
                        <div className="text-slate-400 pl-3">{status!.stage}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          );
        })()}

      {/* Recent service deployments — grouped by service, with expandable logs */}
      {allEvents.length > 0 && (
        <RepoDeployList events={allEvents} connectedServices={connectedServices} cardId={cardId} />
      )}
    </>
  );
};

// ─── Deploy History ──────────────────────────────────────────────────────────

const DeployHistory: React.FC<{ cardId: string }> = ({ cardId }) => {
  const [history, setHistory] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await getApi().deploy.getDeployments(cardId);
        setHistory(Array.isArray(data) ? data : []);
      } catch {
        // ignore
      }
    })();
  }, [cardId]);

  if (history.length === 0) return null;

  const visible = showAll ? history : history.slice(0, 15);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Section title={t('properties.deploy.history')}>
      <div className="space-y-0.5">
        {visible.map((d, i) => {
          const { time, duration, isSuccess, isFailed, isPartial, isPending, actionLabel, actionColor, summaryText } = formatDeployRow(d);
          const isExpanded = expanded.has(d.id);
          return (
            <div key={d.id || i} className="text-ice-xs">
              <div
                className="flex items-center gap-2 py-1 cursor-pointer hover:bg-ice-bg-2/50 -mx-1 px-1 rounded"
                onClick={() => toggleExpand(d.id)}
              >
                <div
                  className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    isSuccess
                      ? 'bg-emerald-500'
                      : isFailed
                        ? 'bg-red-500'
                        : isPartial
                          ? 'bg-amber-500'
                          : isPending
                            ? 'bg-blue-500 animate-pulse'
                            : 'bg-slate-500',
                  )}
                />
                <span className={cn('text-ice-2xs px-1 py-0.5 rounded', actionColor)}>{actionLabel}</span>
                <span className="text-ice-text-2 truncate">{time}</span>
                {d.environment && <span className="text-ice-2xs text-ice-text-3">{d.environment}</span>}
                {duration && <span className="ml-auto text-ice-text-3 font-mono">{duration}</span>}
              </div>
              {summaryText && !isExpanded && (
                <div className="pl-4 pb-1 text-ice-2xs text-ice-text-3">{summaryText}</div>
              )}
              {isExpanded && (
                <div className="pl-4 pb-2 space-y-1 text-ice-2xs">
                  {d.error && <div className="text-red-400 break-words">{d.error}</div>}
                  {summaryText && <div className="text-ice-text-2">{summaryText}</div>}
                  {Array.isArray(d.results?.resources) && d.results.resources.length > 0 && (
                    <div className="space-y-0.5">
                      {d.results.resources.map((r: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 font-mono">
                          <span
                            className={cn('w-1 h-1 rounded-full shrink-0', r.success ? 'bg-emerald-500' : 'bg-red-500')}
                          />
                          <span className="text-ice-text-3 truncate">{r.type}</span>
                          <span className="text-ice-text-2 truncate">{r.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-ice-text-3 font-mono">
                    {d.provider} · {d.region} · {d.id.slice(0, 8)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!showAll && history.length > 15 && (
          <button className="text-ice-2xs text-ice-text-3 hover:text-ice-text-2 pt-1" onClick={() => setShowAll(true)}>
            Show all {history.length} deploys
          </button>
        )}
      </div>
    </Section>
  );
};

// ─── Repo Deploy List (grouped by service, expandable logs) ─────────────────

const RepoDeployList: React.FC<{
  events: DeploymentEvent[];
  connectedServices: Array<{ id: string; label: string }>;
  cardId: string;
}> = ({ events, connectedServices, cardId }) => {
  const dispatch = useDispatch<AppDispatch>();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <Section title={t('pipeline.serviceDeploys')}>
      <div className="space-y-1">
        {events.slice(0, 8).map((ev) => {
          const isExpanded = expandedId === ev.id;
          const logs = (ev.deployment_logs || []) as DeployStep[];
          return (
            <div key={ev.id} className="rounded border border-ice-border overflow-hidden">
              <div
                className="flex items-center gap-1.5 text-ice-xs px-2 py-1.5 cursor-pointer hover:bg-ice-hover transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : ev.id)}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    ev.status === 'success'
                      ? 'bg-emerald-500'
                      : ev.status === 'failed'
                        ? 'bg-red-500'
                        : ev.status === 'building' || ev.status === 'deploying'
                          ? 'bg-blue-500 animate-pulse'
                          : 'bg-ice-text-3'
                  }`}
                />
                <span className="font-mono text-ice-text-2">{ev.commit_sha?.slice(0, 7)}</span>
                <span className="text-ice-text-3 truncate flex-1">{ev.commit_message}</span>
                <span className="text-ice-text-3 shrink-0">{ev.rule?.environment || ev.branch}</span>
                <span className="text-ice-text-3 shrink-0">{formatAge(ev.started_at)}</span>
                <span className={`shrink-0 text-ice-text-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                  &#9662;
                </span>
              </div>

              {/* Expanded logs */}
              {isExpanded && (
                <div className="border-t border-ice-border bg-slate-950 px-2 py-1.5 space-y-0.5 max-h-28 overflow-y-auto">
                  {logs.length > 0 ? (
                    logs.map((log, i) => (
                      <div key={i} className="flex items-center gap-1 text-ice-2xs font-mono">
                        <span
                          className={`shrink-0 ${
                            log.status === 'completed'
                              ? 'text-emerald-500'
                              : log.status === 'failed'
                                ? 'text-red-400'
                                : 'text-blue-400'
                          }`}
                        >
                          {log.status === 'completed' ? '\u2713' : log.status === 'failed' ? '\u2717' : '\u25CF'}
                        </span>
                        <span className={log.status === 'failed' ? 'text-red-400' : 'text-slate-300'}>
                          {log.message}
                        </span>
                        {log.duration_ms != null && (
                          <span className="ml-auto text-slate-500">{(log.duration_ms / 1000).toFixed(1)}s</span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-ice-2xs font-mono text-slate-500">{t('properties.noLogsRecorded')}</div>
                  )}
                  {ev.error && (
                    <div className="text-ice-2xs font-mono text-red-400 pt-1 border-t border-slate-800">{ev.error}</div>
                  )}
                  {ev.duration_seconds != null && (
                    <div className="text-ice-2xs font-mono text-slate-500 pt-0.5">
                      {ev.duration_seconds < 60
                        ? `${ev.duration_seconds}s`
                        : `${Math.floor(ev.duration_seconds / 60)}m ${ev.duration_seconds % 60}s`}
                    </div>
                  )}
                  {ev.status === 'failed' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        import('../../../shared/api/api-adapter').then(({ getApi }) => {
                          getApi()
                            .pipeline.retryDeploy(ev.id)
                            .then(() => {
                              // Refresh events for the relevant service nodes
                              for (const svc of connectedServices) {
                                dispatch(fetchEventsForNode({ cardId, nodeId: svc.id }));
                              }
                            });
                        });
                      }}
                      className="mt-1 px-2 py-0.5 text-ice-2xs font-medium rounded bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                    >
                      {t('common.buttons.retry')}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
};
