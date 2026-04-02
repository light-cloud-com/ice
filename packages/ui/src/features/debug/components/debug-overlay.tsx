/**
 * Debug Overlay Panel
 *
 * Togglable overlay (Ctrl+Shift+D / Cmd+Shift+D) showing canvas diagnostic data.
 * Collapsible to a small pill showing node/edge counts.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from '../../../i18n';
import { toggleDebugPanel } from '../../../store/slices/debug-slice';
import type { RootState, AppDispatch } from '../../../store';

export const DebugOverlay: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { panelOpen, lastAction, lastActionTime, renderDuration } = useSelector((state: RootState) => state.debug);
  const cards = useSelector((state: RootState) => state.cards);
  const selection = useSelector((state: RootState) => state.selection);

  const [collapsed, setCollapsed] = useState(false);

  // Keyboard shortcut: Ctrl+Shift+D / Cmd+Shift+D
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        dispatch(toggleDebugPanel());
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch]);

  // Get active card data
  const activeCard = useMemo(() => {
    return cards.cards.find((c) => c.id === cards.activeCardId);
  }, [cards.cards, cards.activeCardId]);

  const nodeCount = activeCard?.nodes.length ?? 0;
  const edgeCount = activeCard?.edges.length ?? 0;
  const groupCount =
    activeCard?.nodes.filter((n) => n.type === 'container' || ((n.data?.iceType as string) || '').startsWith('Group.'))
      .length ?? 0;
  const blockCount =
    activeCard?.nodes.filter(
      (n) => n.type === 'block' && n.type !== 'container',
    ).length ?? 0;
  const resourceCount = nodeCount - blockCount - groupCount;

  const selectedNodeIds = selection.selectedNodes ?? [];
  const selectedEdgeIds = selection.selectedEdges ?? [];

  const lastActionAgo = lastActionTime ? `${Math.round((Date.now() - lastActionTime) / 1000)}s ago` : 'none';

  if (!panelOpen) return null;

  // Collapsed pill
  if (collapsed) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-[9999] rounded-full px-3 py-1 cursor-pointer font-mono text-ice-xs tabular-nums"
        style={{
          background: 'rgba(15, 23, 42, 0.9)',
          border: '1px solid #334155',
          color: '#94a3b8',
        }}
      >
        {nodeCount}n {edgeCount}e
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] w-80 max-h-[480px] rounded-lg font-mono text-ice-xs overflow-hidden"
      style={{
        background: 'var(--ice-bg-overlay)',
        border: '1px solid #334155',
        color: '#cbd5e1',
      }}
    >
      {/* Header */}
      <div
        className="flex justify-between items-center px-3 py-2"
        style={{
          borderBottom: '1px solid #1e293b',
          background: 'rgba(30, 41, 59, 0.5)',
        }}
      >
        <span className="font-bold" style={{ color: '#8b5cf6' }}>{t('debug.title')}</span>
        <div className="flex gap-2">
          <button
            onClick={() => setCollapsed(true)}
            className="bg-transparent border-none cursor-pointer text-ice-xs"
            style={{ color: '#64748b' }}
          >
            _
          </button>
          <button
            onClick={() => dispatch(toggleDebugPanel())}
            className="bg-transparent border-none cursor-pointer text-ice-xs"
            style={{ color: '#64748b' }}
          >
            x
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-3 py-2 flex flex-col gap-1.5">
        <Row
          label={t('debug.nodes')}
          value={`${nodeCount} (${groupCount} ${t('debug.groups')}, ${blockCount} ${t('debug.blocks')}, ${resourceCount} ${t('debug.resources')})`}
        />
        <Row label={t('debug.edges')} value={String(edgeCount)} />
        <Row label={t('debug.activeCard')} value={activeCard?.name || cards.activeCardId || 'none'} />
        <Divider />
        <Row label={t('debug.selectedNodes')} value={selectedNodeIds.length > 0 ? selectedNodeIds.join(', ') : t('debug.none')} />
        <Row label={t('debug.selectedEdges')} value={selectedEdgeIds.length > 0 ? selectedEdgeIds.join(', ') : t('debug.none')} />
        <Divider />
        <Row label={t('debug.lastAction')} value={lastAction || t('debug.none')} />
        <Row label={t('debug.actionTime')} value={lastActionAgo} />
        <Row label={t('debug.render')} value={renderDuration > 0 ? `${renderDuration.toFixed(1)}ms` : '-'} />
      </div>

      {/* Node list (scrollable) */}
      {activeCard && activeCard.nodes.length > 0 && (
        <div
          className="max-h-[200px] overflow-y-auto py-1"
          style={{ borderTop: '1px solid #1e293b' }}
        >
          <div className="px-3 py-1 font-semibold text-ice-2xs" style={{ color: '#64748b' }}>
            {t('debug.nodesHeader', { count: nodeCount })}
          </div>
          {activeCard.nodes.map((node) => (
            <div
              key={node.id}
              className="px-3 py-0.5 text-ice-2xs flex gap-2"
              style={{ color: '#94a3b8' }}
            >
              <span className="min-w-[50px]" style={{ color: '#64748b' }}>{node.type}</span>
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {(node.data?.label as string) || node.id}
              </span>
              <span style={{ color: '#475569' }}>
                ({Math.round(node.position?.x || 0)},{Math.round(node.position?.y || 0)})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between gap-2">
    <span style={{ color: '#64748b' }}>{label}</span>
    <span className="text-right overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px]">
      {value}
    </span>
  </div>
);

const Divider: React.FC = () => <div className="my-0.5" style={{ borderTop: '1px solid #1e293b' }} />;
