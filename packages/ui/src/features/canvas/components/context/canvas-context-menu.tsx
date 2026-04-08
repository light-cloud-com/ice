/**
 * Canvas Context Menu — orchestrator
 *
 * Delegates to CanvasMenu, NodeMenu, or EdgeMenu based on context type.
 * Builds block/template category data for the canvas menu.
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { CanvasMenu } from './canvas-menu';
import { EdgeMenu } from './edge-menu';
import { NodeMenu } from './node-menu';
import { getBlockCategoryLabel, BLOCK_CATEGORY_ORDER } from '../../../../config/block-categories';
import { BLOCK_BLUEPRINTS, getBlueprint, expandBlueprint } from '../../../../config/blocks';
import { ALL_TEMPLATES, TEMPLATE_CATEGORIES, expandComposedTemplate } from '../../../../config/templates';
import axiosInstance from '../../../../shared/api/axios-instance';
import { selectActiveCard, expandBlueprintToCard, importToActiveCard } from '../../../../store/slices/cards-slice';
import { closeContextMenu } from '../../../../store/slices/ui-slice';
import type { RootState, AppDispatch } from '../../../../store';
import type { EdgeStyle } from '../../../../store/slices/ui-slice';

export const CanvasContextMenu: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const menuRef = useRef<HTMLDivElement>(null);

  const contextMenu = useSelector((state: RootState) => state.ui.contextMenu);
  const selectedNodes = useSelector((state: RootState) => state.selection.selectedNodes);
  const showProperties = useSelector((state: RootState) => state.ui.showProperties);
  const activeCard = useSelector(selectActiveCard);
  const currentZoom = activeCard?.viewport?.scale ?? 1;
  const edgeStyle = useSelector((state: RootState) => state.ui.edgeStyle) as EdgeStyle;
  const canvasLocked = useSelector((state: RootState) => state.ui.canvasLocked);
  const history = useSelector((state: RootState) => {
    const cardId = state.cards.activeCardId;
    return cardId ? state.cards.history[cardId] : undefined;
  });

  // Project provider for block filtering
  const activeProjectId = useSelector((state: RootState) => state.projects.activeProjectId);
  const [projectProvider, setProjectProvider] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProjectId) {
      setProjectProvider(null);
      return;
    }
    axiosInstance
      .post('/canvas/projects/get', { projectId: activeProjectId })
      .then((res) => setProjectProvider(res.data.provider || null))
      .catch(() => setProjectProvider(null));
  }, [activeProjectId]);

  // Block categories
  const blockCategories = useMemo(() => {
    const byCategory = new Map<string, Array<{ label: string; onClick: () => void }>>();
    for (const bp of BLOCK_BLUEPRINTS) {
      if (projectProvider && !bp.providers.includes(projectProvider as any)) continue;
      const cat = bp.category || 'Other';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push({
        label: bp.name,
        onClick: () => {
          const pos = contextMenu.canvasPosition;
          const blueprint = getBlueprint(bp.iceType, projectProvider || undefined);
          if (!blueprint) return;
          const expanded = expandBlueprint(blueprint, { position: pos, provider: projectProvider as any });
          dispatch(expandBlueprintToCard(expanded));
          dispatch(closeContextMenu());
        },
      });
    }
    return Array.from(byCategory.entries())
      .sort((a, b) => {
        const ai = BLOCK_CATEGORY_ORDER.findIndex((c) => c.toLowerCase() === a[0].toLowerCase());
        const bi = BLOCK_CATEGORY_ORDER.findIndex((c) => c.toLowerCase() === b[0].toLowerCase());
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
      .map(([cat, items]) => ({ label: getBlockCategoryLabel(cat), items }));
  }, [projectProvider, contextMenu.canvasPosition, dispatch]);

  // Template categories
  const templateCategories = useMemo(() => {
    const byCategory = new Map<string, Array<{ label: string; onClick: () => void }>>();
    for (const tmpl of ALL_TEMPLATES) {
      const catMeta = TEMPLATE_CATEGORIES.find((c) => c.id === tmpl.category);
      const catLabel = catMeta?.label || tmpl.category || 'Other';
      if (!byCategory.has(catLabel)) byCategory.set(catLabel, []);
      byCategory.get(catLabel)!.push({
        label: tmpl.name,
        onClick: () => {
          const pos = contextMenu.canvasPosition;
          const { nodes, edges } = expandComposedTemplate(tmpl, projectProvider as any);
          const offsetNodes = nodes.map((n: any) => ({
            ...n,
            position: { x: n.position.x + pos.x, y: n.position.y + pos.y },
          }));
          dispatch(importToActiveCard({ nodes: offsetNodes, edges }));
          dispatch(closeContextMenu());
        },
      });
    }
    return Array.from(byCategory.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, items]) => ({ label, items }));
  }, [projectProvider, contextMenu.canvasPosition, dispatch]);

  // Close on outside click / escape
  useEffect(() => {
    if (!contextMenu.isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) dispatch(closeContextMenu());
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch(closeContextMenu());
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu.isOpen, dispatch]);

  if (!contextMenu.isOpen) return null;

  const close = () => dispatch(closeContextMenu());
  const canUndo = (history?.past?.length || 0) > 0;
  const canRedo = (history?.future?.length || 0) > 0;

  if (contextMenu.type === 'canvas') {
    return (
      <CanvasMenu
        menuRef={menuRef}
        position={contextMenu.position}
        blockCategories={blockCategories}
        templateCategories={templateCategories}
        canUndo={canUndo}
        canRedo={canRedo}
        currentZoom={currentZoom}
        activeCard={activeCard}
        edgeStyle={edgeStyle}
        canvasLocked={canvasLocked}
        close={close}
        dispatch={dispatch}
      />
    );
  }

  if (contextMenu.type === 'node' && contextMenu.targetId) {
    return (
      <NodeMenu
        menuRef={menuRef}
        position={contextMenu.position}
        targetId={contextMenu.targetId}
        activeCard={activeCard}
        selectedNodes={selectedNodes}
        showProperties={showProperties}
        currentZoom={currentZoom}
        close={close}
        dispatch={dispatch}
      />
    );
  }

  if (contextMenu.type === 'edge' && contextMenu.targetId) {
    return (
      <EdgeMenu
        menuRef={menuRef}
        position={contextMenu.position}
        targetId={contextMenu.targetId}
        showProperties={showProperties}
        close={close}
        dispatch={dispatch}
      />
    );
  }

  return null;
};
