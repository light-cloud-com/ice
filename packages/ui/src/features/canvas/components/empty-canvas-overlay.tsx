/**
 * Empty Canvas Overlay
 *
 * Compact hint at the bottom of an empty canvas.
 * Users can pick a quick-start template or dismiss.
 */

import { Globe, Rocket, Server, Activity, Zap, X, LayoutTemplate } from 'lucide-react';
import React, { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { ARCHETYPE_COLORS } from '../../../config/color-palette';
import { getTemplatesByCategory, expandComposedTemplate } from '../../../config/templates';
import { useTranslation } from '../../../i18n';
import { importToActiveCard } from '../../../store/slices/cards-slice';
import type { ComposedTemplate } from '../../../config/templates';
import type { AppDispatch } from '../../../store';

const ICON_MAP: Record<string, React.ElementType> = {
  Globe,
  Rocket,
  Server,
  Activity,
  Zap,
};

interface EmptyCanvasOverlayProps {
  onDismiss?: () => void;
}

export const EmptyCanvasOverlay: React.FC<EmptyCanvasOverlayProps> = ({ onDismiss }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  const handleSelect = useCallback(
    (template: ComposedTemplate) => {
      const { nodes, edges } = expandComposedTemplate(template);
      dispatch(importToActiveCard({ nodes, edges }));
      onDismiss?.();
    },
    [dispatch, onDismiss],
  );

  const templates = getTemplatesByCategory('quick-start');

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20" style={{ pointerEvents: 'auto' }}>
      <div className="bg-ice-surface border border-ice-border rounded-xl shadow-lg px-4 py-3 max-w-md">
        <div className="flex items-center justify-between mb-2">
          <span className="text-ice-xs font-medium text-ice-text-2">{t('canvas.emptyState.quickStart')}</span>
          <button
            onClick={onDismiss}
            className="p-0.5 rounded hover:bg-ice-hover text-ice-text-3 hover:text-ice-text-2 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
        <div className="flex gap-1.5">
          {templates.map((qs) => {
            const Icon = ICON_MAP[qs.icon] || Globe;
            const color = ARCHETYPE_COLORS[qs.id] || '#3b82f6';
            return (
              <button
                key={qs.id}
                onClick={() => handleSelect(qs)}
                className="flex flex-col items-center gap-1 px-2.5 py-2 rounded-lg border border-ice-border hover:border-ice-border-strong hover:bg-ice-hover transition-all text-center min-w-[72px]"
              >
                <Icon style={{ width: 14, height: 14, color }} />
                <span className="text-ice-2xs text-ice-text-2 leading-tight">{qs.name}</span>
              </button>
            );
          })}
          <button
            onClick={() => navigate('/templates')}
            className="flex flex-col items-center gap-1 px-2.5 py-2 rounded-lg border border-ice-border hover:border-ice-border-strong hover:bg-ice-hover transition-all text-center min-w-[72px]"
          >
            <LayoutTemplate style={{ width: 14, height: 14 }} className="text-ice-text-3" />
            <span className="text-ice-2xs text-ice-text-2 leading-tight">{t('canvas.emptyState.more')}</span>
          </button>
        </div>
        <div className="mt-2 text-ice-2xs text-ice-text-3 text-center">{t('canvas.emptyState.hint')}</div>
      </div>
    </div>
  );
};
