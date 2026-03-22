/**
 * Canvas Context Menu
 *
 * HTML-based context menu overlay for the canvas.
 * Renders different menus for canvas, node, and edge right-clicks.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../../../store';
import { closeContextMenu, toggleProperties } from '../../../../store/slices/ui-slice';
import {
  deleteCardNode,
  deleteCardEdge,
  toggleCardNodeFold,
  autoOrganizeCard,
  updateCardNodeData,
  updateCardEdgeData,
  selectActiveCard,
  expandBlueprintToCard,
} from '../../../../store/slices/cards-slice';
import {
  setSelectedNodes,
  setSelectedEdges,
  clearSelection,
} from '../../../../store/slices/selection-slice';
import { getBlueprint, expandBlueprint } from '../../../../config/blocks';

/** Fire a synthetic keyboard event so clipboard/undo hooks pick it up */
function fireKey(key: string, ctrl = false) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: ctrl, metaKey: ctrl, bubbles: true }));
}

interface MenuItemProps {
  label: string;
  shortcut?: string;
  danger?: boolean;
  onClick: () => void;
}

const MenuItem: React.FC<MenuItemProps> = ({ label, shortcut, danger, onClick }) => (
  <button
    className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs rounded
      ${
        danger ? 'text-red-400 hover:bg-red-950/50' : 'text-ice-text-1 hover:bg-ice-hover'
      } transition-colors`}
    onClick={onClick}
  >
    <span>{label}</span>
    {shortcut && <span className="text-ice-text-3 ml-4 text-ice-xs">{shortcut}</span>}
  </button>
);

const Separator: React.FC = () => <div className="h-px bg-ice-border my-1" />;

// Submenu component — opens a flyout on hover
const SubMenu: React.FC<{
  label: string;
  items: Array<{ label: string; onClick: () => void }>;
}> = ({ label, items }) => {
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const handleEnter = () => {
    clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };
  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => setIsOpen(false), 150);
  };

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
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

export const CanvasContextMenu: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const menuRef = useRef<HTMLDivElement>(null);

  const contextMenu = useSelector((state: RootState) => state.ui.contextMenu);
  const selectedNodes = useSelector((state: RootState) => state.selection.selectedNodes);
  const showProperties = useSelector((state: RootState) => state.ui.showProperties);
  const activeCard = useSelector(selectActiveCard);

  // Close on outside click
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

  // Helper: ensure properties panel is open
  const openProperties = () => {
    if (!showProperties) dispatch(toggleProperties());
  };

  // Canvas menu
  if (contextMenu.type === 'canvas') {
    // Top 5 blocks for quick add
    const quickBlocks = [
      { label: 'Backend', type: 'scalable-backend' },
      { label: 'Database', type: 'database' },
      { label: 'Cache', type: 'redis-cache' },
      { label: 'Queue', type: 'queue' },
      { label: 'Storage', type: 'storage' },
    ];

    const addBlockItems = quickBlocks.map(({ label, type }) => ({
      label,
      onClick: () => {
        const bp = getBlueprint(type);
        if (bp) {
          const expanded = expandBlueprint(bp, {
            position: { x: contextMenu.position.x, y: contextMenu.position.y },
          });
          dispatch(expandBlueprintToCard(expanded));
        }
        close();
      },
    }));

    return (
      <div
        ref={menuRef}
        className="fixed z-50 min-w-[180px] bg-ice-overlay border border-ice-border rounded-lg shadow-xl py-1 px-1"
        style={{ left: contextMenu.position.x, top: contextMenu.position.y }}
      >
        <SubMenu label="Add Block" items={addBlockItems} />
        <Separator />
        <MenuItem
          label="Select All"
          shortcut="Ctrl+A"
          onClick={() => {
            const allNodeIds = activeCard?.nodes.map((n: any) => n.id) || [];
            dispatch(setSelectedNodes(allNodeIds));
            close();
          }}
        />
        <MenuItem
          label="Auto-organize"
          onClick={() => {
            dispatch(autoOrganizeCard());
            close();
          }}
        />
        <Separator />
        <MenuItem
          label="Paste"
          shortcut="Ctrl+V"
          onClick={() => {
            close();
            fireKey('v', true);
          }}
        />
      </div>
    );
  }

  // Node menu
  if (contextMenu.type === 'node' && contextMenu.targetId) {
    const targetId = contextMenu.targetId;
    const hasMultiSelection = selectedNodes.length > 1;
    const targetNode = activeCard?.nodes.find((n) => n.id === targetId);
    const nodeLabel = (targetNode?.data?.label as string) || targetId;
    const nodeIceType = (targetNode?.data?.iceType as string) || '';
    const nodeProvider = (targetNode?.data?.provider as string) || '';
    const estimatedCost = (targetNode?.data?.estimatedCost as string) || '';

    const providerItems = ['aws', 'gcp', 'azure', 'k8s', 'alibaba', 'oci', 'do'].map((p) => ({
      label: p.toUpperCase(),
      onClick: () => {
        dispatch(updateCardNodeData({ nodeId: targetId, data: { provider: p } }));
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
          label="Properties"
          onClick={() => {
            dispatch(setSelectedNodes([targetId]));
            openProperties();
            close();
          }}
        />
        <Separator />
        <MenuItem
          label="Copy"
          shortcut="Ctrl+C"
          onClick={() => {
            close();
            fireKey('c', true);
          }}
        />
        <MenuItem label="Copy as Text" onClick={copyText} />
        <MenuItem
          label="Cut"
          shortcut="Ctrl+X"
          onClick={() => {
            close();
            fireKey('x', true);
          }}
        />
        <MenuItem
          label="Duplicate"
          onClick={() => {
            close();
            // Copy then paste = duplicate
            fireKey('c', true);
            setTimeout(() => fireKey('v', true), 50);
          }}
        />
        <Separator />
        <SubMenu label="Change Provider" items={providerItems} />
        <MenuItem
          label="Fold/Unfold"
          onClick={() => {
            dispatch(toggleCardNodeFold(targetId));
            close();
          }}
        />
        <Separator />
        <MenuItem
          label={hasMultiSelection ? `Delete ${selectedNodes.length} items` : 'Delete'}
          shortcut="Del"
          danger
          onClick={() => {
            if (hasMultiSelection) {
              for (const id of selectedNodes) {
                dispatch(deleteCardNode(id));
              }
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

  // Edge menu
  if (contextMenu.type === 'edge' && contextMenu.targetId) {
    const targetId = contextMenu.targetId;

    const relationshipItems = ['connects_to', 'depends_on', 'references', 'logs_to'].map((rel) => ({
      label: rel.replace(/_/g, ' '),
      onClick: () => {
        dispatch(updateCardEdgeData({ edgeId: targetId, data: { relationship: rel } }));
        close();
      },
    }));

    return (
      <div
        ref={menuRef}
        className="fixed z-50 min-w-[160px] bg-ice-overlay border border-ice-border rounded-lg shadow-xl py-1 px-1"
        style={{ left: contextMenu.position.x, top: contextMenu.position.y }}
      >
        <MenuItem
          label="Properties"
          onClick={() => {
            dispatch(setSelectedEdges([targetId]));
            openProperties();
            close();
          }}
        />
        <Separator />
        <SubMenu label="Change Type" items={relationshipItems} />
        <Separator />
        <MenuItem
          label="Delete Connection"
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

export default CanvasContextMenu;
