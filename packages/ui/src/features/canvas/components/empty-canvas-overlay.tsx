/**
 * Empty Canvas Overlay
 *
 * Railway-inspired "What are you building?" prompt shown when
 * the active card has zero nodes. Users pick an archetype or
 * start with a blank canvas.
 */

import { Globe, Rocket, Server, Activity, FileCode2, LayoutTemplate } from 'lucide-react';
import React, { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { getBlueprint, expandBlueprint } from '../../../config/blocks';
import { ARCHETYPE_COLORS } from '../../../config/color-palette';
import { getTemplatesByCategory } from '../../../config/templates';
import { expandComposedTemplate } from '../../../config/templates/expand-template';
import { useTranslation } from '../../../i18n';
import { importToActiveCard, expandBlueprintToCard } from '../../../store/slices/cards-slice';
import { openDialog } from '../../../store/slices/ui-slice';
import type { ComposedTemplate } from '../../../config/templates/types';
import type { AppDispatch } from '../../../store';

const ICON_MAP: Record<string, React.ElementType> = {
  Globe,
  Rocket,
  Server,
  Activity,
};

interface EmptyCanvasOverlayProps {
  onDismiss?: () => void;
}

export const EmptyCanvasOverlay: React.FC<EmptyCanvasOverlayProps> = ({ onDismiss }) => {
  const { t } = useTranslation();
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
        <h2 className="text-ice-2xl font-semibold text-ice-text-1 mb-1.5">{t('canvas.emptyState.title')}</h2>
        <p className="text-ice-md text-ice-text-2 mb-7">{t('canvas.emptyState.subtitle')}</p>

        {/* Archetype grid */}
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          {getTemplatesByCategory('quick-start').map((qs) => {
            const Icon = ICON_MAP[qs.icon] || Globe;
            const color = ARCHETYPE_COLORS[qs.id] || '#3b82f6';
            return (
              <button
                key={qs.id}
                onClick={() => handleSelect(qs)}
                className="flex flex-col items-center gap-2 px-4 py-5 rounded-xl border border-ice-border bg-ice-raised cursor-pointer transition-all hover:border-ice-border-strong hover:shadow-md"
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
            {t('canvas.emptyState.blankCanvas')}
          </button>
          <button
            onClick={handleOpenTemplates}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-ice-border bg-transparent text-ice-text-2 text-xs font-medium cursor-pointer transition-all hover:border-ice-border-strong hover:text-ice-text-1"
          >
            <LayoutTemplate className="w-3.5 h-3.5" />
            {t('canvas.emptyState.pickTemplate')}
          </button>
        </div>
      </div>
    </div>
  );
};

