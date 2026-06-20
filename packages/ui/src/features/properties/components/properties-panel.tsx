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

import React, { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { EdgePropertiesSection } from './sections/edge-properties-section';
import { NodePropertiesSection } from './sections/node-properties-section';
import { ProjectOverview } from './sections/project-overview';
import { selectActiveCard, type CardNode, type CardEdge } from '../../../store/slices/cards-slice';
import { useResourceMap, usePropertyIssues } from '../hooks/use-resource-map';
import type { RootState } from '../../../store';

// ResourceInfoPanel removed — IaC mapping, network ports, and about section
// were technical details that confused non-technical users

// ─── Main PropertiesPanel ────────────────────────────────────────────────────

export const PropertiesPanel: React.FC = () => {
  const activeCard = useSelector(selectActiveCard);
  const { selectedNodes, selectedEdges } = useSelector((state: RootState) => state.selection);
  const validationIssues = useSelector((state: RootState) => state.validation?.issues ?? []);
  // PE8 — surface the debounced validation's in-flight state so the panel can
  // show a "checking…" cue instead of the inline feedback silently lagging.
  const isValidating = useSelector((state: RootState) => state.validation?.isValidating ?? false);

  // ─── Properties tab state ──────────────────────────────────────────────────
  // The `propsTab` state lives at the orchestrator level (lifted from the
  // node-selected branch) so the in-render `setPropsTab(...)` fallback inside
  // `NodePropertiesSection` can mutate it without making `setPropsTab` go
  // through a re-mount cycle on every selection change. The setter is passed
  // down as a prop along with the value — see rf-props-24.
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

  // ═══ EDGE SELECTED ═══
  if (selectedEdge && activeCard) {
    return <EdgePropertiesSection selectedEdge={selectedEdge} activeCard={activeCard} />;
  }

  // ═══ NODE SELECTED ═══
  if (selectedNode && activeCard) {
    return (
      <NodePropertiesSection
        selectedNode={selectedNode}
        activeCard={activeCard}
        resourceMap={resourceMap}
        propertyIssuesMap={propertyIssuesMap}
        propsTab={propsTab}
        setPropsTab={setPropsTab}
        validationIssues={validationIssues}
        isValidating={isValidating}
        activeEnvName={activeEnvName}
      />
    );
  }

  // ═══ NOTHING SELECTED — Project Overview ═══
  return <ProjectOverview activeCard={activeCard} />;
};
