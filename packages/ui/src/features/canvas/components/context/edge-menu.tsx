/**
 * Edge Menu — context menu shown when right-clicking on an edge.
 */

import React from 'react';
import { MenuItem, Separator } from './menu-primitives';
import { useTranslation } from '../../../../i18n';
import { deleteCardEdge } from '../../../../store/slices/cards-slice';
import { setSelectedEdges } from '../../../../store/slices/selection-slice';
import { toggleProperties } from '../../../../store/slices/ui-slice';
import type { AppDispatch } from '../../../../store';

interface EdgeMenuProps {
  menuRef: React.RefObject<HTMLDivElement | null>;
  position: { x: number; y: number };
  targetId: string;
  showProperties: boolean;
  close: () => void;
  dispatch: AppDispatch;
}

export const EdgeMenu: React.FC<EdgeMenuProps> = ({ menuRef, position, targetId, showProperties, close, dispatch }) => {
  const { t } = useTranslation();

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] bg-ice-overlay border border-ice-border rounded-lg shadow-xl py-1 px-1"
      style={{ left: position.x, top: position.y }}
    >
      <MenuItem
        label={t('canvas.contextMenu.properties')}
        onClick={() => {
          dispatch(setSelectedEdges([targetId]));
          if (!showProperties) dispatch(toggleProperties());
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
};
