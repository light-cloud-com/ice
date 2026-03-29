/**
 * Step 1: Project Info
 *
 * Project name, description, and provider selection.
 */

import React from 'react';
import { useTranslation } from '../../../i18n';
import { ENABLED_PROVIDERS } from '../../../config/providers';
import { cn } from '../../../shared/utils/cn';
import type { Provider } from '../../../config/blocks/types';

interface ProjectInfoStepProps {
  projectName: string;
  projectDescription: string;
  provider: Provider;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onProviderChange: (provider: Provider) => void;
}

export const ProjectInfoStep: React.FC<ProjectInfoStepProps> = ({
  projectName,
  projectDescription,
  provider,
  onNameChange,
  onDescriptionChange,
  onProviderChange,
}) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-ice-text-1 mb-1">{t('wizard.projectInfo.nameTitle')}</h3>
        <p className="text-xs text-ice-text-2 mb-2">{t('wizard.projectInfo.nameHint')}</p>
        <input
          type="text"
          value={projectName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t('wizard.projectInfo.namePlaceholder')}
          autoFocus
          className="w-full h-9 rounded-md border border-ice-border bg-ice-base text-ice-text-1 text-sm px-3 placeholder:text-ice-text-3 focus:outline-none focus:ring-1 focus:ring-ice-accent focus:border-ice-accent"
        />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-ice-text-1 mb-1">{t('wizard.projectInfo.descriptionTitle')}</h3>
        <p className="text-xs text-ice-text-2 mb-2">{t('wizard.projectInfo.descriptionHint')}</p>
        <textarea
          value={projectDescription}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder={t('wizard.projectInfo.descriptionPlaceholder')}
          rows={3}
          className="w-full rounded-md border border-ice-border bg-ice-base text-ice-text-1 text-sm px-3 py-2 placeholder:text-ice-text-3 focus:outline-none focus:ring-1 focus:ring-ice-accent focus:border-ice-accent resize-none"
        />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-ice-text-1 mb-1">{t('wizard.projectInfo.providerTitle')}</h3>
        <p className="text-xs text-ice-text-2 mb-2">{t('wizard.projectInfo.providerHint')}</p>
        <div className="grid grid-cols-4 gap-2">
          {ENABLED_PROVIDERS.map((opt) => {
            const isSelected = provider === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => onProviderChange(opt.id as Provider)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border p-2.5 transition-all text-center',
                  isSelected
                    ? 'border-ice-accent bg-ice-accent-muted ring-1 ring-ice-accent'
                    : 'border-ice-border bg-ice-surface hover:border-ice-border-strong',
                )}
              >
                <span className="text-xs font-bold" style={{ color: isSelected ? opt.color : '#8b949e' }}>
                  {opt.shortName}
                </span>
                <span className={cn('text-ice-2xs leading-tight', isSelected ? 'text-ice-text-2' : 'text-ice-text-3')}>
                  {opt.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
