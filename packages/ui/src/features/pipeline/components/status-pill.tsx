/**
 * rf-ppanel-3 — StatusPill.
 *
 * Pipeline status badge: rounded-full pill with per-status palette.
 *
 * Five known statuses (queued, building, deploying, success, failed) route
 * through `t('pipeline.status.<status>')`; an unknown status falls back to
 * the verbatim status string with the neutral hover palette. Both branches
 * are load-bearing — Redux can transiently hold a status outside the table.
 */

import React from 'react';
import { useTranslation } from '../../../i18n';
import { cn } from '../../../shared/utils/cn';

export interface StatusPillProps {
  status: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status }) => {
  const { t } = useTranslation();
  const config: Record<string, { label: string; className: string }> = {
    queued: { label: t('pipeline.status.queued'), className: 'bg-yellow-500/10 text-yellow-500' },
    building: { label: t('pipeline.status.building'), className: 'bg-blue-500/10 text-blue-500' },
    deploying: { label: t('pipeline.status.deploying'), className: 'bg-purple-500/10 text-purple-500' },
    success: { label: t('pipeline.status.success'), className: 'bg-emerald-500/10 text-emerald-500' },
    failed: { label: t('pipeline.status.failed'), className: 'bg-red-500/10 text-red-500' },
  };
  const c = config[status] || { label: status, className: 'bg-ice-hover text-ice-text-3' };
  return <span className={cn('px-1.5 py-0.5 text-ice-2xs font-semibold rounded-full', c.className)}>{c.label}</span>;
};
