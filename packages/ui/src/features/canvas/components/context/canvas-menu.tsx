/**
 * Canvas Menu — context menu shown when right-clicking on empty canvas.
 */

import React, { useState, useRef } from 'react';
import { MenuItem, Separator, SubMenu, CategorySubMenu, modKey, isMac, fireKey } from './menu-primitives';
import { useTranslation } from '../../../../i18n';
import { autoOrganizeCard, undoCardChange, redoCardChange } from '../../../../store/slices/cards-slice';
import { setSelectedNodes } from '../../../../store/slices/selection-slice';
import { setEdgeStyle, toggleCanvasLocked, type EdgeStyle } from '../../../../store/slices/ui-slice';
import type { AppDispatch } from '../../../../store';

interface CanvasMenuProps {
  menuRef: React.RefObject<HTMLDivElement | null>;
  position: { x: number; y: number };
  blockCategories: Array<{ label: string; items: Array<{ label: string; onClick: () => void }> }>;
  templateCategories: Array<{ label: string; items: Array<{ label: string; onClick: () => void }> }>;
  canUndo: boolean;
  canRedo: boolean;
  currentZoom: number;
  activeCard: any;
  edgeStyle: EdgeStyle;
  canvasLocked: boolean;
  close: () => void;
  dispatch: AppDispatch;
}

export const CanvasMenu: React.FC<CanvasMenuProps> = ({
  menuRef,
  position,
  blockCategories,
  templateCategories,
  canUndo,
  canRedo,
  currentZoom,
  activeCard,
  edgeStyle,
  canvasLocked,
  close,
  dispatch,
}) => {
  const { t } = useTranslation();
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

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] bg-ice-overlay border border-ice-border rounded-lg shadow-xl py-1 px-1"
      style={{ left: position.x, top: position.y }}
    >
      {!canvasLocked ? (
        <>
          <CategorySubMenu
            label={t('canvas.contextMenu.addBlock')}
            categories={blockCategories}
            isOpen={openId === 'block'}
            {...hover('block')}
          />
          <CategorySubMenu
            label={t('canvas.contextMenu.addTemplate')}
            categories={templateCategories}
            isOpen={openId === 'template'}
            {...hover('template')}
          />
        </>
      ) : (
        <MenuItem label={t('canvas.contextMenu.canvasLocked')} disabled onClick={() => {}} />
      )}
      <Separator />
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
      <SubMenu
        label={t('canvas.contextMenu.autoOrganize')}
        isOpen={openId === 'organize'}
        {...hover('organize')}
        items={[
          {
            label: t('canvas.contextMenu.layoutVertical'),
            onClick: () => {
              dispatch(autoOrganizeCard({ direction: 'vertical', zoom: currentZoom }));
              close();
            },
          },
          {
            label: t('canvas.contextMenu.layoutHorizontal'),
            onClick: () => {
              dispatch(autoOrganizeCard({ direction: 'horizontal', zoom: currentZoom }));
              close();
            },
          },
          {
            label: t('canvas.contextMenu.layoutCircular'),
            onClick: () => {
              dispatch(autoOrganizeCard({ layout: 'circular', zoom: currentZoom }));
              close();
            },
          },
        ]}
      />
      <SubMenu
        label={t('canvas.contextMenu.connectionStyle')}
        isOpen={openId === 'edge'}
        {...hover('edge')}
        items={[
          {
            label: `${t('canvas.contextMenu.edgeBezier')}${edgeStyle === 'bezier' ? ' ✓' : ''}`,
            onClick: () => {
              dispatch(setEdgeStyle('bezier'));
              close();
            },
          },
          {
            label: `${t('canvas.contextMenu.edgeStraight')}${edgeStyle === 'straight' ? ' ✓' : ''}`,
            onClick: () => {
              dispatch(setEdgeStyle('straight'));
              close();
            },
          },
          {
            label: `${t('canvas.contextMenu.edgeRectangular')}${edgeStyle === 'rectangular' ? ' ✓' : ''}`,
            onClick: () => {
              dispatch(setEdgeStyle('rectangular'));
              close();
            },
          },
        ]}
      />
      <MenuItem
        label={canvasLocked ? t('canvas.contextMenu.unlockCanvas') : t('canvas.contextMenu.lockCanvas')}
        onClick={() => {
          dispatch(toggleCanvasLocked());
          close();
        }}
      />
    </div>
  );
};
