/**
 * Step 2: Environments
 *
 * Toggle environments (production/staging/dev/PR),
 * set region and security level per environment.
 */

import React from 'react';
import { Globe, Shield } from 'lucide-react';
import { cn } from '../../../shared/utils/cn';
import type { SecurityLevel } from '../../../config/templates/types';
import type { WizardEnvironment } from '../hooks/use-wizard-state';

const REGIONS = [
  'us-central1',
  'us-east1',
  'us-west1',
  'europe-west1',
  'europe-west3',
  'asia-east1',
  'asia-southeast1',
];

const SECURITY_LEVELS: { value: SecurityLevel; label: string; color: string }[] = [
  { value: 'basic', label: 'Basic', color: '#6b7280' },
  { value: 'standard', label: 'Standard', color: '#3b82f6' },
  { value: 'strict', label: 'Strict', color: '#f59e0b' },
  { value: 'compliance', label: 'Compliance', color: '#22c55e' },
];

const ENV_TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  production: { label: 'Production', emoji: '🟢' },
  staging: { label: 'Staging', emoji: '🟡' },
  development: { label: 'Development', emoji: '🔵' },
  pr: { label: 'PR Preview', emoji: '🟣' },
};

interface EnvironmentStepProps {
  environments: WizardEnvironment[];
  onToggle: (index: number) => void;
  onRegionChange: (index: number, region: string) => void;
  onSecurityChange: (index: number, level: SecurityLevel) => void;
  onAllSecurityChange: (level: SecurityLevel) => void;
}

export const EnvironmentStep: React.FC<EnvironmentStepProps> = ({
  environments,
  onToggle,
  onRegionChange,
  onSecurityChange,
  onAllSecurityChange,
}) => {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-ice-text-1 mb-1">Environments</h3>
        <p className="text-xs text-ice-text-2 mb-3">
          Select which environments to create. Each gets its own canvas tab.
        </p>
      </div>

      {/* Environment cards */}
      <div className="space-y-2">
        {environments.map((env, index) => {
          const meta = ENV_TYPE_LABELS[env.type];
          return (
            <div
              key={env.type}
              className={cn(
                'rounded-lg border transition-all',
                env.enabled
                  ? 'border-ice-border bg-ice-surface'
                  : 'border-ice-border bg-ice-base opacity-60'
              )}
            >
              {/* Toggle row */}
              <button
                onClick={() => onToggle(index)}
                className="flex items-center gap-3 w-full px-3 py-2.5 text-left"
              >
                <div
                  className={cn(
                    'w-4 h-4 rounded border-2 flex items-center justify-center transition-all',
                    env.enabled
                      ? 'bg-ice-accent border-ice-accent'
                      : 'border-ice-border bg-transparent'
                  )}
                >
                  {env.enabled && (
                    <svg
                      viewBox="0 0 12 12"
                      className="w-2.5 h-2.5 text-ice-text-1"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M2 6l3 3 5-5" />
                    </svg>
                  )}
                </div>
                <span className="text-xs">{meta.emoji}</span>
                <span className="text-sm font-medium text-ice-text-1">{meta.label}</span>
              </button>

              {/* Config row — only when enabled */}
              {env.enabled && (
                <div className="flex items-center gap-3 px-3 pb-2.5 pt-0">
                  {/* Region */}
                  <div className="flex items-center gap-1.5 flex-1">
                    <Globe className="w-3 h-3 text-ice-text-2 shrink-0" />
                    <select
                      value={env.region}
                      onChange={(e) => onRegionChange(index, e.target.value)}
                      className="h-7 flex-1 rounded border border-ice-border bg-ice-base text-ice-text-1 text-xs px-2 focus:outline-none focus:ring-1 focus:ring-ice-accent appearance-none cursor-pointer"
                    >
                      {REGIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Security level */}
                  <div className="flex items-center gap-1.5 flex-1">
                    <Shield className="w-3 h-3 text-ice-text-2 shrink-0" />
                    <select
                      value={env.securityLevel}
                      onChange={(e) => onSecurityChange(index, e.target.value as SecurityLevel)}
                      className="h-7 flex-1 rounded border border-ice-border bg-ice-base text-ice-text-1 text-xs px-2 focus:outline-none focus:ring-1 focus:ring-ice-accent appearance-none cursor-pointer"
                    >
                      {SECURITY_LEVELS.map((sl) => (
                        <option key={sl.value} value={sl.value}>
                          {sl.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Global security selector */}
      <div className="pt-2 border-t border-ice-border">
        <div className="flex items-center gap-2">
          <span className="text-xs text-ice-text-2">Set all to:</span>
          {SECURITY_LEVELS.map((sl) => (
            <button
              key={sl.value}
              onClick={() => onAllSecurityChange(sl.value)}
              className="text-ice-xs px-2 py-1 rounded border border-ice-border bg-ice-base hover:bg-ice-hover transition-colors"
              style={{ color: sl.color }}
            >
              {sl.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
