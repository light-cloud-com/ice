/**
 * Onboarding Step 1 — Welcome
 *
 * Simple greeting screen. No decisions — just says hello.
 */

import React from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from '../../../i18n';
import type { RootState } from '../../../store';

export const WelcomeStep: React.FC = () => {
  const userName = useSelector((s: RootState) => s.account.user?.name);
  const { t } = useTranslation();

  return (
    <div className="space-y-6 text-center py-4">
      <div>
        <h2 className="text-2xl font-semibold text-ice-text-1">
          {userName ? t('onboarding.welcome.titleWithName', { name: userName.split(' ')[0] }) : t('onboarding.welcome.title')}
        </h2>
        <p className="text-sm text-ice-text-2 mt-2">{t('onboarding.welcome.subtitle')}</p>
      </div>

      <div className="space-y-3 text-left max-w-sm mx-auto">
        <Feature title={t('onboarding.welcome.featureCanvas')} description={t('onboarding.welcome.featureCanvasDesc')} />
        <Feature title={t('onboarding.welcome.featureMultiCloud')} description={t('onboarding.welcome.featureMultiCloudDesc')} />
        <Feature title={t('onboarding.welcome.featureCiCd')} description={t('onboarding.welcome.featureCiCdDesc')} />
      </div>

      <p className="text-xs text-ice-text-3">{t('onboarding.welcome.setupHint')}</p>
    </div>
  );
};

const Feature: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="flex items-start gap-3 p-3 rounded-lg bg-ice-surface border border-ice-border">
    <div className="w-1.5 h-1.5 rounded-full bg-ice-accent mt-1.5 shrink-0" />
    <div>
      <p className="text-sm font-medium text-ice-text-1">{title}</p>
      <p className="text-xs text-ice-text-2">{description}</p>
    </div>
  </div>
);
