/**
 * Node Menu — context menu shown when right-clicking on a node.
 */

import { CLOUD_PROVIDERS } from '@ice/constants';
import React, { useState, useRef } from 'react';
import { MenuItem, Separator, SubMenu, modKey, fireKey } from './menu-primitives';
import { useTranslation } from '../../../../i18n';
import {
  deleteCardNode,
  toggleCardNodeFold,
  autoOrganizeCard,
  updateCardNodeData,
  groupSelectedNodes,
} from '../../../../store/slices/cards-slice';
import { setSelectedNodes, clearSelection } from '../../../../store/slices/selection-slice';
import { toggleProperties } from '../../../../store/slices/ui-slice';
import type { AppDispatch } from '../../../../store';

interface NodeMenuProps {
  menuRef: React.Ref<HTMLDivElement>;
  position: { x: number; y: number };
  targetId: string;
  activeCard: any;
  selectedNodes: string[];
  showProperties: boolean;
  currentZoom: number;
  close: () => void;
  dispatch: AppDispatch;
}

export const NodeMenu: React.FC<NodeMenuProps> = ({
  menuRef,
  position,
  targetId,
  activeCard,
  selectedNodes,
  showProperties,
  currentZoom,
  close,
  dispatch,
}) => {
  const { t } = useTranslation();
  const hasMultiSelection = selectedNodes.length > 1;
  const targetNode = activeCard?.nodes.find((n: any) => n.id === targetId);
  const nodeLabel = (targetNode?.data?.label as string) || targetId;
  const nodeIceType = (targetNode?.data?.iceType as string) || '';
  const nodeProvider = (targetNode?.data?.provider as string) || '';
  const estimatedCost = (targetNode?.data?.estimatedCost as string) || '';
  const isContainer = targetNode?.type === 'container';

  // Controlled submenu state
  const [openId, setOpenId] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const hover = (id: string) => ({
    onEnter: () => {
      clearTimeout(closeTimer.current);
      setOpenId(id);
    },
    onLeave: () => {
      closeTimer.current = setTimeout(() => setOpenId(null), 100);
    },
  });

  const providerItems = CLOUD_PROVIDERS.map((p) => ({
    label: p.shortName,
    onClick: () => {
      dispatch(updateCardNodeData({ nodeId: targetId, data: { provider: p.id } }));
      close();
    },
  }));

  const openProperties = () => {
    if (!showProperties) dispatch(toggleProperties());
  };

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
      style={{ left: position.x, top: position.y }}
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
      <SubMenu
        label={t('canvas.contextMenu.changeProvider')}
        items={providerItems}
        isOpen={openId === 'provider'}
        {...hover('provider')}
      />
      {isContainer && (
        <>
          <MenuItem
            label={targetNode?.data?.folded ? t('canvas.contextMenu.unfold') : t('canvas.contextMenu.fold')}
            onClick={() => {
              dispatch(toggleCardNodeFold(targetId));
              close();
            }}
          />
          <SubMenu
            label={t('canvas.contextMenu.autoOrganize')}
            isOpen={openId === 'organize'}
            {...hover('organize')}
            items={[
              {
                label: 'Vertical ↕',
                onClick: () => {
                  dispatch(autoOrganizeCard({ direction: 'vertical', containerId: targetId, zoom: currentZoom }));
                  close();
                },
              },
              {
                label: 'Horizontal ↔',
                onClick: () => {
                  dispatch(autoOrganizeCard({ direction: 'horizontal', containerId: targetId, zoom: currentZoom }));
                  close();
                },
              },
              {
                label: 'Circular ◎',
                onClick: () => {
                  dispatch(autoOrganizeCard({ layout: 'circular', containerId: targetId, zoom: currentZoom }));
                  close();
                },
              },
            ]}
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
        label={
          hasMultiSelection
            ? t('canvas.contextMenu.deleteItems', { count: selectedNodes.length })
            : t('canvas.contextMenu.delete')
        }
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
};
