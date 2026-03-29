/**
 * Onboarding Step 5 — First Project
 *
 * Quick project creation with template cards.
 * Selecting a template auto-names the project.
 */

import { Globe, Rocket, Server, Activity, FileBox } from 'lucide-react';
import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from '../../../i18n';
import { COMPOSED_TEMPLATES } from '../../../config/templates';
import { QUICK_STARTS } from '../../../config/templates/quick-starts';
import { cn } from '../../../shared/utils/cn';
import { setProjectName, setSelectedTemplateId } from '../../../store/slices/onboarding-slice';
import type { RootState, AppDispatch } from '../../../store';

const ICON_MAP: Record<string, React.ElementType> = {
  Globe,
  Rocket,
  Server,
  Activity,
};

const TEMPLATE_OPTIONS = [
  ...QUICK_STARTS.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    icon: t.icon,
    defaultName: `My ${t.name}`,
  })),
  ...COMPOSED_TEMPLATES.slice(0, 2).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    icon: t.icon,
    defaultName: `My ${t.name}`,
  })),
];

export const FirstProjectStep: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { t } = useTranslation();
  const projectName = useSelector((s: RootState) => s.onboarding.projectName);
  const selectedTemplateId = useSelector((s: RootState) => s.onboarding.selectedTemplateId);

  const handleSelectTemplate = (id: string | null, defaultName?: string) => {
    dispatch(setSelectedTemplateId(id));
    if (defaultName && (!projectName || projectName.startsWith('My '))) {
      dispatch(setProjectName(defaultName));
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-ice-text-1">{t('onboarding.project.title')}</h2>
        <p className="text-sm text-ice-text-2 mt-1">{t('onboarding.project.subtitle')}</p>
      </div>

      {/* Project name */}
      <div>
        <label className="block text-sm font-medium text-ice-text-2 mb-1.5">{t('onboarding.project.nameLabel')}</label>
        <input
          id="ice-onboarding-project-input-name"
          type="text"
          value={projectName}
          onChange={(e) => dispatch(setProjectName(e.target.value))}
          placeholder={t('onboarding.project.namePlaceholder')}
          className="ice-input w-full"
        />
      </div>

      {/* Template grid */}
      <div className="grid grid-cols-2 gap-2">
        {TEMPLATE_OPTIONS.map((t) => {
          const Icon = ICON_MAP[t.icon] || FileBox;
          const isSelected = selectedTemplateId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleSelectTemplate(t.id, t.defaultName)}
              className={cn(
                'flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all',
                isSelected
                  ? 'border-ice-accent bg-ice-accent/5 ring-1 ring-ice-accent/30'
                  : 'border-ice-border bg-ice-surface hover:border-ice-text-3',
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', isSelected ? 'text-ice-accent' : 'text-ice-text-2')} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ice-text-1 truncate">{t.name}</p>
                <p className="text-xs text-ice-text-2 line-clamp-2">{t.description}</p>
              </div>
            </button>
          );
        })}

        {/* Blank canvas option */}
        <button
          type="button"
          onClick={() => handleSelectTemplate(null, 'My Project')}
          className={cn(
            'flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all col-span-2',
            selectedTemplateId === null
              ? 'border-ice-accent bg-ice-accent/5 ring-1 ring-ice-accent/30'
              : 'border-ice-border bg-ice-surface hover:border-ice-text-3',
          )}
        >
          <FileBox
            className={cn(
              'w-4 h-4 shrink-0 mt-0.5',
              selectedTemplateId === null ? 'text-ice-accent' : 'text-ice-text-2',
            )}
          />
          <div>
            <p className="text-sm font-medium text-ice-text-1">{t('onboarding.project.blankCanvas')}</p>
            <p className="text-xs text-ice-text-2">{t('onboarding.project.blankCanvasDesc')}</p>
          </div>
        </button>
      </div>
    </div>
  );
};
