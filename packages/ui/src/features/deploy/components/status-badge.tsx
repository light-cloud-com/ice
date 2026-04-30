/**
 * StatusBadge
 *
 * Small pill rendering the current `DeployStatus`. Returns `null` for
 * `'idle'` and for any status not in the config table — both null branches
 * are load-bearing: Redux can transiently hold a status outside this table.
 */

import React from 'react';
import { useTranslation } from '../../../i18n';
import { cn } from '../../../shared/utils/cn';
import type { DeployStatus } from '../../../store/slices/deploy-slice';

export const StatusBadge: React.FC<{ status: DeployStatus; id?: string }> = ({ status, id }) => {
  const { t } = useTranslation();
  if (status === 'idle') return null;

  const config: Record<string, { label: string; color: string }> = {
    authenticating: {
      label: t('deploy.status.authenticating'),
      color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    },
    planning: {
      label: t('deploy.status.planning'),
      color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    },
    planned: {
      label: t('deploy.status.planned'),
      color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    },
    deploying: {
      label: t('deploy.status.deploying'),
      color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    },
    destroying: {
      label: 'Destroying',
      color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    },
    success: {
      label: t('deploy.status.success'),
      color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    },
    error: {
      label: t('deploy.status.error'),
      color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    },
    cancelled: {
      label: t('deploy.status.cancelled'),
      color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300',
    },
  };

  const c = config[status];
  if (!c) return null;

  return (
    <span id={id} className={cn('px-2 py-0.5 text-xs font-medium rounded-full', c.color)}>
      {c.label}
    </span>
  );
};
