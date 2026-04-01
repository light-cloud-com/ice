/**
 * Canvas Context Menu
 *
 * Right-click context menu for canvas, nodes, and edges.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from '../../../../i18n';
import {
  deleteCardNode,
  deleteCardEdge,
  toggleCardNodeFold,
  autoOrganizeCard,
  updateCardNodeData,
  selectActiveCard,
  undoCardChange,
  redoCardChange,
  groupSelectedNodes,
} from '../../../../store/slices/cards-slice';
import { setSelectedNodes, setSelectedEdges, clearSelection } from '../../../../store/slices/selection-slice';
import { closeContextMenu, toggleProperties } from '../../../../store/slices/ui-slice';
import type { RootState, AppDispatch } from '../../../../store';

// ── Platform-aware shortcut labels ──────────────────────────────────────────

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
const MOD = isMac ? '⌘' : 'Ctrl+';
function modKey(key: string): string {
  return `${MOD}${key}`;
}

/** Fire a synthetic keyboard event so clipboard/undo hooks pick it up */
function fireKey(key: string, ctrl = false) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: ctrl, metaKey: ctrl, bubbles: true }));
}

// ── Menu primitives ─────────────────────────────────────────────────────────

interface MenuItemProps {
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

const MenuItem: React.FC<MenuItemProps> = ({ label, shortcut, danger, disabled, onClick }) => (
  <button
    disabled={disabled}
    className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs rounded transition-colors
      ${disabled ? 'text-ice-text-3 cursor-default' : danger ? 'text-red-400 hover:bg-red-950/50' : 'text-ice-text-1 hover:bg-ice-hover'}`}
    onClick={disabled ? undefined : onClick}
  >
    <span>{label}</span>
    {shortcut && <span className="text-ice-text-3 ml-4 text-ice-xs">{shortcut}</span>}
  </button>
);

const Separator: React.FC = () => <div className="h-px bg-ice-border my-1" />;

const SubMenu: React.FC<{
  label: string;
  items: Array<{ label: string; onClick: () => void }>;
}> = ({ label, items }) => {
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        clearTimeout(timeoutRef.current);
        setIsOpen(true);
      }}
      onMouseLeave={() => {
        timeoutRef.current = setTimeout(() => setIsOpen(false), 150);
      }}
    >
      <button className="w-full flex items-center justify-between px-3 py-1.5 text-left text-xs rounded text-ice-text-1 hover:bg-ice-hover transition-colors">
        <span>{label}</span>
        <span className="text-ice-text-3 text-ice-xs ml-4">▸</span>
      </button>
      {isOpen && (
        <div className="absolute left-full top-0 ml-1 min-w-[140px] bg-ice-overlay border border-ice-border rounded-lg shadow-xl py-1 px-1 z-50">
          {items.map((item) => (
            <button
              key={item.label}
              className="w-full flex items-center px-3 py-1.5 text-left text-xs rounded text-ice-text-1 hover:bg-ice-hover transition-colors"
              onClick={item.onClick}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Constants ───────────────────────────────────────────────────────────────

const SUPPORTED_PROVIDERS = [
  { value: 'gcp', label: 'GCP' },
  { value: 'aws', label: 'AWS' },
  { value: 'azure', label: 'Azure' },
  { value: 'k8s', label: 'Kubernetes' },
];

// ── Main component ──────────────────────────────────────────────────────────

export const CanvasContextMenu: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const menuRef = useRef<HTMLDivElement>(null);

  const contextMenu = useSelector((state: RootState) => state.ui.contextMenu);
  const selectedNodes = useSelector((state: RootState) => state.selection.selectedNodes);
  const showProperties = useSelector((state: RootState) => state.ui.showProperties);
  const activeCard = useSelector(selectActiveCard);
  const currentZoom = activeCard?.viewport?.scale ?? 1;
  const history = useSelector((state: RootState) => {
    const cardId = state.cards.activeCardId;
    return cardId ? state.cards.history[cardId] : undefined;
  });

  useEffect(() => {
    if (!contextMenu.isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        dispatch(closeContextMenu());
      }
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
  const openProperties = () => {
    if (!showProperties) dispatch(toggleProperties());
  };

  const canUndo = (history?.past?.length || 0) > 0;
  const canRedo = (history?.future?.length || 0) > 0;

  // ── Canvas menu ─────────────────────────────────────────────────────────

  if (contextMenu.type === 'canvas') {
    return (
      <div
        ref={menuRef}
        className="fixed z-50 min-w-[180px] bg-ice-overlay border border-ice-border rounded-lg shadow-xl py-1 px-1"
        style={{ left: contextMenu.position.x, top: contextMenu.position.y }}
      >
        <MenuItem
          label={t('canvas.contextMenu.undo')}
          shortcut={modKey('Z')}
          disabled={!canUndo}
          onClick={() => {
            dispatch(undoCardChange());
            close();
          }}
        />
        <MenuItem
          label={t('canvas.contextMenu.redo')}
          shortcut={isMac ? '⇧⌘Z' : 'Ctrl+Y'}
          disabled={!canRedo}
          onClick={() => {
            dispatch(redoCardChange());
            close();
          }}
        />
        <Separator />
        <MenuItem
          label={t('canvas.contextMenu.paste')}
          shortcut={modKey('V')}
          onClick={() => {
            close();
            fireKey('v', true);
          }}
        />
        <MenuItem
          label={t('canvas.contextMenu.selectAll')}
          shortcut={modKey('A')}
          onClick={() => {
            dispatch(setSelectedNodes(activeCard?.nodes.map((n: any) => n.id) || []));
            close();
          }}
        />
        <Separator />
        <MenuItem
          label={t('canvas.contextMenu.autoOrganize') + ' ↕'}
          onClick={() => {
            dispatch(autoOrganizeCard({ direction: 'vertical', zoom: currentZoom }));
            close();
          }}
        />
        <MenuItem
          label={t('canvas.contextMenu.autoOrganize') + ' ↔'}
          onClick={() => {
            dispatch(autoOrganizeCard({ direction: 'horizontal', zoom: currentZoom }));
            close();
          }}
        />
        <MenuItem
          label={t('canvas.contextMenu.autoOrganize') + ' ◎'}
          onClick={() => {
            dispatch(autoOrganizeCard({ layout: 'circular', zoom: currentZoom }));
            close();
          }}
        />
      </div>
    );
  }

  // ── Node menu ───────────────────────────────────────────────────────────

  if (contextMenu.type === 'node' && contextMenu.targetId) {
    const targetId = contextMenu.targetId;
    const hasMultiSelection = selectedNodes.length > 1;
    const targetNode = activeCard?.nodes.find((n) => n.id === targetId);
    const nodeLabel = (targetNode?.data?.label as string) || targetId;
    const nodeIceType = (targetNode?.data?.iceType as string) || '';
    const nodeProvider = (targetNode?.data?.provider as string) || '';
    const estimatedCost = (targetNode?.data?.estimatedCost as string) || '';
    const isContainer = targetNode?.type === 'container';

    const providerItems = SUPPORTED_PROVIDERS.map(({ value, label }) => ({
      label,
      onClick: () => {
        dispatch(updateCardNodeData({ nodeId: targetId, data: { provider: value } }));
        close();
      },
    }));

    const copyText = () => {
      const parts = [nodeIceType ? `${nodeIceType}: ` : '', nodeLabel];
      if (nodeProvider) parts.push(` (${nodeProvider.toUpperCase()}`);
      if (estimatedCost) parts.push(`, ${estimatedCost}`);
      if (nodeProvider || estimatedCost) parts.push(')');
      navigator.clipboard.writeText(parts.join(''));
      close();
    };

    return (
      <div
        ref={menuRef}
        className="fixed z-50 min-w-[180px] bg-ice-overlay border border-ice-border rounded-lg shadow-xl py-1 px-1"
        style={{ left: contextMenu.position.x, top: contextMenu.position.y }}
      >
        <MenuItem
          label={t('canvas.contextMenu.properties')}
          onClick={() => {
            dispatch(setSelectedNodes([targetId]));
            openProperties();
            close();
          }}
        />
        <Separator />
        <MenuItem
          label={t('canvas.contextMenu.copy')}
          shortcut={modKey('C')}
          onClick={() => {
            close();
            fireKey('c', true);
          }}
        />
        <MenuItem label={t('canvas.contextMenu.copyAsText')} onClick={copyText} />
        <MenuItem
          label={t('canvas.contextMenu.cut')}
          shortcut={modKey('X')}
          onClick={() => {
            close();
            fireKey('x', true);
          }}
        />
        <MenuItem
          label={t('canvas.contextMenu.duplicate')}
          onClick={() => {
            close();
            fireKey('c', true);
            setTimeout(() => fireKey('v', true), 50);
          }}
        />
        <Separator />
        <SubMenu label={t('canvas.contextMenu.changeProvider')} items={providerItems} />
        {isContainer && (
          <>
            <MenuItem
              label={targetNode?.data?.folded ? t('canvas.contextMenu.unfold') : t('canvas.contextMenu.fold')}
              onClick={() => {
                dispatch(toggleCardNodeFold(targetId));
                close();
              }}
            />
            <MenuItem
              label={t('canvas.contextMenu.autoOrganize') + ' ↕'}
              onClick={() => {
                dispatch(autoOrganizeCard({ direction: 'vertical', containerId: targetId, zoom: currentZoom }));
                close();
              }}
            />
            <MenuItem
              label={t('canvas.contextMenu.autoOrganize') + ' ↔'}
              onClick={() => {
                dispatch(autoOrganizeCard({ direction: 'horizontal', containerId: targetId, zoom: currentZoom }));
                close();
              }}
            />
            <MenuItem
              label={t('canvas.contextMenu.autoOrganize') + ' ◎'}
              onClick={() => {
                dispatch(autoOrganizeCard({ layout: 'circular', containerId: targetId, zoom: currentZoom }));
                close();
              }}
            />
          </>
        )}
        {hasMultiSelection && (
          <MenuItem
            label={t('canvas.contextMenu.groupSelection')}
            shortcut={modKey('G')}
            onClick={() => {
              dispatch(groupSelectedNodes(selectedNodes));
              close();
            }}
          />
        )}
        <Separator />
        <MenuItem
          label={hasMultiSelection ? t('canvas.contextMenu.deleteItems', { count: selectedNodes.length }) : t('canvas.contextMenu.delete')}
          shortcut="Del"
          danger
          onClick={() => {
            if (hasMultiSelection) {
              for (const id of selectedNodes) dispatch(deleteCardNode(id));
              dispatch(clearSelection());
            } else {
              dispatch(deleteCardNode(targetId));
              dispatch(setSelectedNodes([]));
            }
            close();
          }}
        />
      </div>
    );
  }

  // ── Edge menu ───────────────────────────────────────────────────────────

  if (contextMenu.type === 'edge' && contextMenu.targetId) {
    const targetId = contextMenu.targetId;

    return (
      <div
        ref={menuRef}
        className="fixed z-50 min-w-[160px] bg-ice-overlay border border-ice-border rounded-lg shadow-xl py-1 px-1"
        style={{ left: contextMenu.position.x, top: contextMenu.position.y }}
      >
        <MenuItem
          label={t('canvas.contextMenu.properties')}
          onClick={() => {
            dispatch(setSelectedEdges([targetId]));
            openProperties();
            close();
          }}
        />
        <Separator />
        <MenuItem
          label={t('canvas.contextMenu.deleteConnection')}
          shortcut="Del"
          danger
          onClick={() => {
            dispatch(deleteCardEdge(targetId));
            close();
          }}
        />
      </div>
    );
  }

  return null;
};

