/**
 * Integration Status Dots
 *
 * Small colored dots in the status bar showing connection state
 * for each configured provider (GitHub, GCP, AWS, Azure).
 */

import { Loader2 } from 'lucide-react';
import React from 'react';
import { useSelector } from 'react-redux';
import { cn } from '../../../shared/utils/cn';
import type { RootState } from '../../../store';
import type { IntegrationStatus } from '../../../store/slices/integrations-slice';

const DOT_COLORS: Record<IntegrationStatus, string> = {
  connected: 'bg-emerald-500',
  disconnected: 'bg-muted-foreground/30',
  connecting: 'bg-orange-400',
  error: 'bg-red-500',
};

const PROVIDER_LABELS: Record<string, string> = {
  github: 'GitHub',
  gcp: 'GCP',
  aws: 'AWS',
  azure: 'Azure',
};
// Note: PROVIDER_LABELS remain hardcoded as product brand names

export const IntegrationStatusDots: React.FC = () => {
  const integrations = useSelector((state: RootState) => state.integrations.integrations);

  // Only show providers that have ever been connected or are in non-default state
  const visibleProviders = Object.entries(integrations).filter(([, info]) => info.status !== 'disconnected');

  if (visibleProviders.length === 0) return null;

  return (
    <>
      <div className="w-px h-3 bg-border" />
      <div className="flex items-center gap-1.5">
        {visibleProviders.map(([id, info]) => (
          <div
            key={id}
            className="flex items-center gap-1"
            title={`${PROVIDER_LABELS[id] || id}: ${info.status}${info.username ? ` (${info.username})` : ''}`}
          >
            {info.status === 'connecting' ? (
              <Loader2 className="w-2.5 h-2.5 animate-spin text-orange-400" />
            ) : (
              <div className={cn('w-2 h-2 rounded-full', DOT_COLORS[info.status])} />
            )}
            <span className="text-ice-xs text-muted-foreground">{PROVIDER_LABELS[id] || id}</span>
          </div>
        ))}
      </div>
    </>
  );
};
