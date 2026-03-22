/**
 * Debug Overlay Panel
 *
 * Togglable overlay (Ctrl+Shift+D / Cmd+Shift+D) showing canvas diagnostic data.
 * Collapsible to a small pill showing node/edge counts.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { toggleDebugPanel } from '../../../store/slices/debug-slice';
import type { RootState, AppDispatch } from '../../../store';

export const DebugOverlay: React.FC = () => {
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
      (n) => (n.type === 'block' || ((n.data?.iceType as string) || '').startsWith('Block.')) && n.type !== 'container',
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
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.9)',
          border: '1px solid #334155',
          borderRadius: 20,
          padding: '4px 12px',
          cursor: 'pointer',
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          fontSize: 11,
          color: '#94a3b8',
        }}
      >
        {nodeCount}n {edgeCount}e
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        width: 320,
        maxHeight: 480,
        background: 'var(--ice-bg-overlay)',
        border: '1px solid #334155',
        borderRadius: 8,
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        fontSize: 11,
        color: '#cbd5e1',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          borderBottom: '1px solid #1e293b',
          background: 'rgba(30, 41, 59, 0.5)',
        }}
      >
        <span style={{ fontWeight: 700, color: '#8b5cf6' }}>ICE Debug</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setCollapsed(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            _
          </button>
          <button
            onClick={() => dispatch(toggleDebugPanel())}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            x
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Row
          label="Nodes"
          value={`${nodeCount} (${groupCount} groups, ${blockCount} blocks, ${resourceCount} resources)`}
        />
        <Row label="Edges" value={String(edgeCount)} />
        <Row label="Active Card" value={activeCard?.name || cards.activeCardId || 'none'} />
        <Divider />
        <Row label="Selected Nodes" value={selectedNodeIds.length > 0 ? selectedNodeIds.join(', ') : 'none'} />
        <Row label="Selected Edges" value={selectedEdgeIds.length > 0 ? selectedEdgeIds.join(', ') : 'none'} />
        <Divider />
        <Row label="Last Action" value={lastAction || 'none'} />
        <Row label="Action Time" value={lastActionAgo} />
        <Row label="Render" value={renderDuration > 0 ? `${renderDuration.toFixed(1)}ms` : '-'} />
      </div>

      {/* Node list (scrollable) */}
      {activeCard && activeCard.nodes.length > 0 && (
        <div
          style={{
            borderTop: '1px solid #1e293b',
            maxHeight: 200,
            overflowY: 'auto',
            padding: '4px 0',
          }}
        >
          <div style={{ padding: '4px 12px', color: '#64748b', fontWeight: 600, fontSize: 10 }}>
            NODES ({nodeCount})
          </div>
          {activeCard.nodes.map((node) => (
            <div
              key={node.id}
              style={{
                padding: '2px 12px',
                fontSize: 10,
                color: '#94a3b8',
                display: 'flex',
                gap: 8,
              }}
            >
              <span style={{ color: '#64748b', minWidth: 50 }}>{node.type}</span>
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
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
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
    <span style={{ color: '#64748b' }}>{label}</span>
    <span
      style={{
        textAlign: 'right',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: 200,
      }}
    >
      {value}
    </span>
  </div>
);

const Divider: React.FC = () => <div style={{ borderTop: '1px solid #1e293b', margin: '2px 0' }} />;

export default DebugOverlay;
