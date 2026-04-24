/**
 * Project Toolbar — contextual sub-page navigation + canvas actions
 *
 * Left:  Canvas · Table · Deployments · Activity · ⚙
 * Right: auto-organize, fit, edge, snap, lock, undo/redo, env selector, deploy
 */

import {
  Rows3,
  Columns3,
  CircleDot,
  Spline,
  Minus,
  GitCommitHorizontal,
  Maximize2,
  Rocket,
  Undo2,
  Redo2,
  Lock,
  LockOpen,
  Grid3X3,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { IceSelect } from './ui/ice-select';
import {
  autoOrganizeCard,
  undoCardChange,
  redoCardChange,
  selectCanUndo,
  selectCanRedo,
  setCardViewport,
  setActiveCard,
  importToActiveCard,
  createCard,
} from '../../store/slices/cards-slice';
import { fetchEnvironments, setActiveEnvironment } from '../../store/slices/environments-slice';
import {
  setEdgeStyle,
  setAutoOrganizeStyle,
  toggleSnapToGrid,
  toggleCanvasLocked,
  type EdgeStyle,
} from '../../store/slices/ui-slice';
import { getApi } from '../api/api-adapter';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './ui/tooltip';
import { cn } from '../utils/cn';
import type { RootState, AppDispatch } from '../../store';

interface ProjectToolbarProps {
  basePath: string;
  activeSubpage: string;
}

const SUB_PAGES = [
  { id: 'canvas', i18nKey: 'projectBrowser.subCanvas' },
  { id: 'table', i18nKey: 'projectBrowser.subTable' },
  { id: 'deployments', i18nKey: 'projectBrowser.subDeployments' },
  { id: 'activity', i18nKey: 'projectBrowser.subActivity' },
];

// ── Small helpers ──────────────────────────────────────────────────────────

const TBtn: React.FC<{
  id?: string;
  icon: React.ElementType;
  onClick: () => void;
  tip?: string;
  className?: string;
  disabled?: boolean;
}> = ({ id, icon: I, onClick, tip, className, disabled }) => {
  const btn = (
    <button
      id={id}
      onClick={onClick}
      aria-label={tip}
      disabled={disabled}
      className={cn(
        'p-1.5 rounded text-ice-text-3 hover:text-ice-text-1 hover:bg-ice-hover transition-[color,background-color]',
        disabled && 'opacity-30 pointer-events-none',
        className,
      )}
    >
      <I className="w-3.5 h-3.5" aria-hidden="true" />
    </button>
  );
  if (!tip) return btn;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent side="bottom" className="text-ice-xs">{tip}</TooltipContent>
    </Tooltip>
  );
};

const TSep: React.FC = () => <div className="w-px h-4 bg-ice-border mx-1" />;

// ── Main component ─────────────────────────────────────────────────────────

export const ProjectToolbar: React.FC<ProjectToolbarProps> = ({ basePath, activeSubpage }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  const isCanvasView = activeSubpage === 'canvas';

  // ── Canvas action state ──────────────────────────────────────────────────
  const canUndo = useSelector(selectCanUndo);
  const canRedo = useSelector(selectCanRedo);
  const edgeStyle = useSelector((s: RootState) => s.ui.edgeStyle) as EdgeStyle;
  const snapEnabled = useSelector((s: RootState) => s.ui.snapToGrid);
  const canvasLocked = useSelector((s: RootState) => s.ui.canvasLocked);
  const deployStatus = useSelector((s: RootState) => s.deploy.status);

  const selectedNodes = useSelector((s: RootState) => s.selection.selectedNodes);
  const activeCard = useSelector((s: RootState) => {
    const cards = s.cards as any;
    return cards.cards?.find((c: any) => c.id === cards.activeCardId);
  });
  const selectedContainerId = useMemo(() => {
    if (selectedNodes.length !== 1 || !activeCard) return undefined;
    const node = activeCard.nodes?.find((n: any) => n.id === selectedNodes[0]);
    return node?.type === 'container' ? node.id : undefined;
  }, [selectedNodes, activeCard]);
  const currentZoom: number = (activeCard?.viewport?.scale as number) ?? 1;

  const cycleEdgeStyle = useCallback(() => {
    const order: EdgeStyle[] = ['bezier', 'straight', 'rectangular'];
    const next = order[(order.indexOf(edgeStyle) + 1) % order.length];
    dispatch(setEdgeStyle(next));
  }, [edgeStyle, dispatch]);

  const edgeIcon = edgeStyle === 'straight' ? Minus : edgeStyle === 'rectangular' ? GitCommitHorizontal : Spline;

  // ── Environment selector ─────────────────────────────────────────────────
  const projectId = useSelector((s: RootState) => s.projects.activeProjectId);
  const environments = useSelector((s: RootState) => (projectId ? s.environments.byProject[projectId] || [] : []));
  const activeEnvId = useSelector((s: RootState) => (projectId ? s.environments.activeEnvId[projectId] : undefined));

  useEffect(() => {
    if (projectId) dispatch(fetchEnvironments(projectId));
  }, [projectId, dispatch]);

  const handleSwitchEnv = useCallback(
    async (envId: string) => {
      if (!projectId) return;
      const env = environments.find((e) => e.id === envId);
      if (!env) return;
      dispatch(setActiveEnvironment({ projectId, envId }));
      try {
        const { store } = await import('../../store');
        const state = store.getState();
        const existing = (state.cards as any).cards.find((c: any) => c.id === env.card_id);
        if (existing && existing.nodes.length > 0) {
          dispatch(setActiveCard(env.card_id));
          return;
        }
        const api = getApi();
        const cardData = await api.graph.load(env.card_id);
        if (!cardData) return;
        if (!existing) {
          dispatch(createCard({ name: cardData.name || env.name, id: cardData.id, projectId }));
        }
        dispatch(setActiveCard(cardData.id));
        if (cardData.nodes?.length > 0 || cardData.edges?.length > 0) {
          dispatch(
            importToActiveCard({ nodes: cardData.nodes || [], edges: cardData.edges || [], skipAutoOrganize: true }),
          );
        }
      } catch (err) {
        console.error('Failed to load environment card:', err);
      }
    },
    [projectId, environments, dispatch],
  );

  // ── Navigation ───────────────────────────────────────────────────────────
  const handleNavigate = (subpage: string) => {
    navigate(subpage === 'canvas' ? basePath : `${basePath}/${subpage}`);
  };

  // ── Fit to view ──────────────────────────────────────────────────────────
  const handleFitView = useCallback(() => {
    if (!activeCard?.nodes?.length) return;
    const nodes = activeCard.nodes;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + (n.width || 240));
      maxY = Math.max(maxY, n.position.y + (n.height || 80));
    }
    const pad = 60;
    const bw = maxX - minX + pad * 2;
    const bh = maxY - minY + pad * 2;
    const vw = window.innerWidth - 300;
    const vh = window.innerHeight - 80;
    const zoom = Math.min(Math.max(vw / bw, 0.1), Math.min(vh / bh, 2));
    const panX = -minX + pad + (vw / zoom - bw + pad * 2) / 2;
    const panY = -minY + pad + (vh / zoom - bh + pad * 2) / 2;
    dispatch(setCardViewport({ panX, panY, scale: zoom }));
  }, [activeCard, dispatch]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-9 flex items-center gap-0.5 px-4 border-b border-ice-border bg-ice-toolbar/50 shrink-0">
        {/* ── Sub-page navigation ─────────────────────────────────────────── */}
        {SUB_PAGES.map((page, i) => (
          <React.Fragment key={page.id}>
            {i > 0 && <span className="text-ice-text-3/30 text-ice-xs select-none mx-0.5">&middot;</span>}
            <button
              onClick={() => handleNavigate(page.id)}
              className={cn(
                'px-2 py-1 text-ice-sm rounded transition-colors',
                activeSubpage === page.id
                  ? 'text-ice-text-1 font-medium bg-ice-active'
                  : 'text-ice-text-3 hover:text-ice-text-2 hover:bg-ice-hover',
              )}
            >
              {t(page.i18nKey)}
            </button>
          </React.Fragment>
        ))}
        <span className="text-ice-text-3/30 text-ice-xs select-none mx-0.5">&middot;</span>
        <button
          onClick={() => handleNavigate('settings')}
          className={cn(
            'px-2 py-1 text-ice-sm rounded transition-colors',
            activeSubpage === 'settings'
              ? 'text-ice-text-1 font-medium bg-ice-active'
              : 'text-ice-text-3 hover:text-ice-text-2 hover:bg-ice-hover',
          )}
        >
          {t('projectBrowser.subSettings')}
        </button>

        {/* ── Spacer ──────────────────────────────────────────────────────── */}
        <div className="flex-1" />

        {/* ── Canvas actions (only on canvas/table views) ─────────────────── */}
        {isCanvasView && (
          <div className="flex items-center gap-0.5">
            <TBtn
              icon={Rows3}
              onClick={() => {
                dispatch(autoOrganizeCard({ direction: 'vertical', containerId: selectedContainerId, zoom: currentZoom }));
                dispatch(setAutoOrganizeStyle('vertical'));
                dispatch(setEdgeStyle('rectangular'));
              }}
              tip={selectedContainerId ? 'Organize group (vertical)' : 'Auto-organize all (vertical)'}
            />
            <TBtn
              icon={Columns3}
              onClick={() => {
                dispatch(autoOrganizeCard({ direction: 'horizontal', containerId: selectedContainerId, zoom: currentZoom }));
                dispatch(setAutoOrganizeStyle('horizontal'));
                dispatch(setEdgeStyle('rectangular'));
              }}
              tip={selectedContainerId ? 'Organize group (horizontal)' : 'Auto-organize all (horizontal)'}
            />
            <TBtn
              icon={CircleDot}
              onClick={() => {
                dispatch(autoOrganizeCard({ layout: 'circular', containerId: selectedContainerId, zoom: currentZoom }));
                dispatch(setAutoOrganizeStyle('circular'));
              }}
              tip={selectedContainerId ? 'Organize group (circular)' : 'Auto-organize all (circular)'}
            />
            <TBtn icon={Maximize2} onClick={handleFitView} tip="Fit to view" />
            <TSep />
            <TBtn icon={edgeIcon} onClick={cycleEdgeStyle} tip={`Connection style: ${edgeStyle}`} />
            <TBtn
              icon={Grid3X3}
              onClick={() => dispatch(toggleSnapToGrid())}
              tip={snapEnabled ? 'Snap to grid: ON' : 'Snap to grid: OFF'}
              className={snapEnabled ? 'text-blue-400 bg-blue-500/10' : undefined}
            />
            <TBtn
              icon={canvasLocked ? Lock : LockOpen}
              onClick={() => dispatch(toggleCanvasLocked())}
              tip={canvasLocked ? 'Canvas locked' : 'Lock canvas'}
              className={canvasLocked ? 'text-amber-400 bg-amber-500/10' : undefined}
            />
            <TBtn icon={Undo2} onClick={() => dispatch(undoCardChange())} tip={t('appBar.undo')} disabled={!canUndo} />
            <TBtn icon={Redo2} onClick={() => dispatch(redoCardChange())} tip={t('appBar.redo')} disabled={!canRedo} />
          </div>
        )}

        {/* ── Environment selector + Deploy ───────────────────────────────── */}
        {projectId && environments.length > 0 && (
          <>
            <TSep />
            <IceSelect
              value={activeEnvId || ''}
              onChange={handleSwitchEnv}
              allowEmpty={false}
              options={environments.map((env) => ({
                value: env.id,
                label: `${env.is_protected ? '🔒 ' : ''}${env.name}${env.type === 'pr' && env.pr_number ? ` #${env.pr_number}` : ''}`,
              }))}
              placeholder="Environment"
              width="140px"
            />
          </>
        )}
        <TSep />
        <TBtn
          id="ice-btn-deploy"
          icon={Rocket}
          onClick={() => handleNavigate('deploy')}
          tip={t('appBar.deploy')}
          className={cn(
            'text-emerald-500 hover:text-emerald-400',
            activeSubpage === 'deploy' && 'bg-ice-active',
            deployStatus === 'deploying' && 'animate-pulse',
          )}
        />
      </div>
    </TooltipProvider>
  );
};
