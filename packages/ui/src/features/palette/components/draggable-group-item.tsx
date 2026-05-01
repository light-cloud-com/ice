/**
 * Resource Palette — DraggableGroupItem.
 *
 * Extracted verbatim from `resource-palette.tsx` (rf-rpal-6). The amber
 * dashed-border "New Group" affordance at the bottom of the blocks list.
 * Drag semantics are load-bearing — preserved without behavior change:
 *
 *   - `application/ice-group` carries the literal 'Custom'.
 *   - `application/ice-group-name` carries the literal 'New Group'.
 *   - `application/ice-group-color` carries the next color from the
 *     GROUP_COLOR_PRESETS cycle (`nextGroupColor`).
 *   - The drag-image has a dashed border in the same color and a
 *     box-shadow with the color's 30-alpha suffix.
 *
 * `groupColorIndex` is module-level mutable state — it cycles through the
 * preset colors per drag and never resets. This matches the source: the
 * color persists across React re-renders and only changes per drag-start.
 */

import { Folder } from 'lucide-react';
import React from 'react';

import { GROUP_COLOR_PRESETS } from '../../../config/color-palette';
import { useTranslation } from '../../../i18n';
import { cn } from '../../../shared/utils/cn';

let groupColorIndex = 0;
export function nextGroupColor(): string {
  const color = GROUP_COLOR_PRESETS[groupColorIndex % GROUP_COLOR_PRESETS.length];
  groupColorIndex++;
  return color;
}

/** Test-only — reset the color counter. Not exported in the package barrel. */
export function __resetGroupColorIndex(): void {
  groupColorIndex = 0;
}

export const DraggableGroupItem: React.FC = () => {
  const { t } = useTranslation();
  const handleDragStart = (e: React.DragEvent) => {
    const color = nextGroupColor();
    e.dataTransfer.setData('application/ice-group', 'Custom');
    e.dataTransfer.setData('application/ice-group-name', 'New Group');
    e.dataTransfer.setData('application/ice-group-color', color);
    e.dataTransfer.effectAllowed = 'move';

    const dragImage = document.createElement('div');
    dragImage.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(15, 23, 35, 0.95);
        color: ${color};
        border-radius: 10px;
        padding: 8px 16px;
        font-size: 12px;
        font-weight: 600;
        box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px ${color}30;
        font-family: 'JetBrains Mono Variable', monospace;
        border: 1px dashed ${color}50;
        letter-spacing: 0.02em;
      ">
        New Group
      </div>
    `;
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={cn(
        'group flex items-center gap-2.5 py-2.5 px-3 mx-1 rounded-lg cursor-grab',
        'border border-dashed border-ice-border hover:border-amber-500/25',
        'hover:bg-amber-500/[0.03]',
        'active:cursor-grabbing active:scale-[0.97]',
        'transition-all duration-200',
      )}
    >
      <Folder className="w-3.5 h-3.5 text-ice-text-3 group-hover:text-amber-400/70 transition-colors shrink-0" />
      <span className="text-ice-base text-ice-text-2 group-hover:text-ice-text-1 transition-colors">
        {t('palette.group')}
      </span>
    </div>
  );
};
