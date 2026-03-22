/**
 * Step 4: Review & Create
 *
 * Summary of project settings before creation.
 */

import React from 'react';
import { Cloud, Globe, Shield, LayoutTemplate, FileCode2 } from 'lucide-react';
import { getCloudProvider } from '@ice-engine/core/resources';
import type { WizardState } from '../hooks/use-wizard-state';
import { COMPOSED_TEMPLATES } from '../../../config/templates';

const SECURITY_COLORS: Record<string, string> = {
  basic: '#6b7280',
  standard: '#3b82f6',
  strict: '#f59e0b',
  compliance: '#22c55e',
};

interface ReviewStepProps {
  state: WizardState;
}

export const ReviewStep: React.FC<ReviewStepProps> = ({ state }) => {
  const enabledEnvs = state.environments.filter((e) => e.enabled);
  const template = state.selectedTemplateId
    ? COMPOSED_TEMPLATES.find((t) => t.id === state.selectedTemplateId)
    : null;
  const providerMeta = getCloudProvider(state.provider);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-ice-text-1 mb-1">Review & Create</h3>
        <p className="text-xs text-ice-text-2 mb-3">Confirm your project settings before creating</p>
      </div>

      {/* Project info */}
      <div className="rounded-lg border border-ice-border bg-ice-surface p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <Cloud className="w-3.5 h-3.5" style={{ color: providerMeta?.color ?? '#4285f4' }} />
          <span className="text-ice-text-2">Project</span>
        </div>
        <div className="pl-5.5">
          <p className="text-sm font-semibold text-ice-text-1">{state.projectName}</p>
          {state.projectDescription && (
            <p className="text-xs text-ice-text-2 mt-0.5">{state.projectDescription}</p>
          )}
          <div className="flex items-center gap-1 mt-1">
            <span
              className="text-ice-xs px-1.5 py-0.5 rounded font-medium"
              style={{
                color: providerMeta?.color ?? '#4285f4',
                backgroundColor: (providerMeta?.color ?? '#4285f4') + '1a',
              }}
            >
              {providerMeta?.shortName ?? state.provider.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Environments */}
      <div className="rounded-lg border border-ice-border bg-ice-surface p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <Globe className="w-3.5 h-3.5 text-ice-text-2" />
          <span className="text-ice-text-2">Environments ({enabledEnvs.length})</span>
        </div>
        <div className="space-y-1.5">
          {enabledEnvs.map((env) => (
            <div key={env.type} className="flex items-center gap-2 pl-5.5">
              <span className="text-xs text-ice-text-1 font-medium w-24">{env.name}</span>
              <span className="text-ice-xs text-ice-text-2 font-mono">{env.region}</span>
              <span
                className="text-ice-xs px-1.5 py-0.5 rounded font-medium ml-auto"
                style={{
                  color: SECURITY_COLORS[env.securityLevel],
                  backgroundColor: SECURITY_COLORS[env.securityLevel] + '20',
                }}
              >
                <Shield className="w-2.5 h-2.5 inline mr-0.5 -mt-0.5" />
                {env.securityLevel}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Template */}
      <div className="rounded-lg border border-ice-border bg-ice-surface p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <LayoutTemplate className="w-3.5 h-3.5 text-ice-text-2" />
          <span className="text-ice-text-2">Template</span>
        </div>
        <div className="flex items-center gap-2 pl-5.5">
          {template ? (
            <>
              <span className="text-xs text-ice-text-1 font-medium">{template.name}</span>
              <span className="text-ice-xs text-ice-text-2">{template.blocks.length} blocks</span>
              <span className="text-ice-xs text-ice-text-2 ml-auto">{template.estimatedCost}</span>
            </>
          ) : (
            <>
              <FileCode2 className="w-3.5 h-3.5 text-ice-text-2" />
              <span className="text-xs text-ice-text-1 font-medium">Blank Canvas</span>
            </>
          )}
        </div>
      </div>

      {/* Summary count */}
      <div className="text-center text-xs text-ice-text-2 pt-1">
        This will create {enabledEnvs.length} environment{enabledEnvs.length !== 1 ? 's' : ''}{' '}
        {template ? `with ${template.blocks.length} blocks each` : 'with blank canvases'}
      </div>
    </div>
  );
};
