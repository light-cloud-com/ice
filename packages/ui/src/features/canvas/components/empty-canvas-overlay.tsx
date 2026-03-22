/**
 * Empty Canvas Overlay
 *
 * Railway-inspired "What are you building?" prompt shown when
 * the active card has zero nodes. Users pick an archetype or
 * start with a blank canvas.
 */

import React, { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { Globe, Rocket, Server, Activity, FileCode2, LayoutTemplate } from 'lucide-react';
import type { AppDispatch } from '../../../store';
import { importToActiveCard, expandBlueprintToCard } from '../../../store/slices/cards-slice';
import { openDialog } from '../../../store/slices/ui-slice';
import { getTemplatesByCategory } from '../../../config/templates';
import { expandComposedTemplate } from '../../../config/templates/expand-template';
import { getBlueprint, expandBlueprint } from '../../../config/blocks';
import type { ComposedTemplate } from '../../../config/templates/types';
import { EMPTY_CANVAS } from '../../../i18n/messages';

const ICON_MAP: Record<string, React.ElementType> = {
  Globe,
  Rocket,
  Server,
  Activity,
};

const ARCHETYPE_COLORS: Record<string, string> = {
  'qs-website-db': '#3b82f6',
  'qs-webapp-api': '#22c55e',
  'qs-api-only': '#8b5cf6',
  'qs-data-pipeline': '#f59e0b',
};

interface EmptyCanvasOverlayProps {
  onDismiss?: () => void;
}

export const EmptyCanvasOverlay: React.FC<EmptyCanvasOverlayProps> = ({ onDismiss }) => {
  const dispatch = useDispatch<AppDispatch>();

  const handleSelect = useCallback(
    (template: ComposedTemplate) => {
      const { nodes, edges } = expandComposedTemplate(template);
      dispatch(importToActiveCard({ nodes, edges }));
    },
    [dispatch],
  );

  const handleBlank = useCallback(() => {
    // Place a Public Traffic node as the default entry point
    const blueprint = getBlueprint('public-traffic');
    if (blueprint) {
      const expanded = expandBlueprint(blueprint, {
        position: { x: 300, y: 300 },
      });
      dispatch(expandBlueprintToCard(expanded));
    }
    onDismiss?.();
  }, [dispatch, onDismiss]);

  const handleOpenTemplates = useCallback(() => {
    // The TemplatePicker is in the toolbar — we can't programmatically open it
    // But we can open the project wizard which has a template step
    dispatch(openDialog('projectWizard'));
  }, [dispatch]);

  return (
    <div className="absolute inset-0 flex items-center justify-center z-20" style={{ pointerEvents: 'auto' }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ice-base/60 backdrop-blur-sm" />

      {/* Content */}
      <div className="relative z-10 text-center max-w-lg px-6">
        {/* Heading */}
        <h2 className="text-ice-2xl font-semibold text-ice-text-1 mb-1.5">{EMPTY_CANVAS.TITLE}</h2>
        <p className="text-ice-md text-ice-text-2 mb-7">{EMPTY_CANVAS.SUBTITLE}</p>

        {/* Archetype grid */}
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          {getTemplatesByCategory('quick-start').map((qs) => {
            const Icon = ICON_MAP[qs.icon] || Globe;
            const color = ARCHETYPE_COLORS[qs.id] || '#3b82f6';
            return (
              <button
                key={qs.id}
                onClick={() => handleSelect(qs)}
                className="flex flex-col items-center gap-2 p-[18px_14px] rounded-xl border border-ice-border bg-ice-raised cursor-pointer transition-all hover:border-ice-border-strong hover:shadow-md"
              >
                <div
                  className="w-10 h-10 rounded-[10px] flex items-center justify-center"
                  style={{ background: `${color}1a` }}
                >
                  <Icon style={{ width: 20, height: 20, color }} />
                </div>
                <span className="text-ice-md font-semibold text-ice-text-1">{qs.name}</span>
                <span className="text-ice-sm text-ice-text-2 leading-snug">{qs.description}</span>
              </button>
            );
          })}
        </div>

        {/* Secondary options */}
        <div className="flex justify-center gap-3">
          <button
            onClick={handleBlank}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-ice-border bg-transparent text-ice-text-2 text-xs font-medium cursor-pointer transition-all hover:border-ice-border-strong hover:text-ice-text-1"
          >
            <FileCode2 className="w-3.5 h-3.5" />
            {EMPTY_CANVAS.BLANK_CANVAS}
          </button>
          <button
            onClick={handleOpenTemplates}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-ice-border bg-transparent text-ice-text-2 text-xs font-medium cursor-pointer transition-all hover:border-ice-border-strong hover:text-ice-text-1"
          >
            <LayoutTemplate className="w-3.5 h-3.5" />
            {EMPTY_CANVAS.PICK_TEMPLATE}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmptyCanvasOverlay;
