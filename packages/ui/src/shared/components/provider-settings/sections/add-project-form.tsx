/**
 * Provider Settings — `AddProjectForm` section.
 *
 * Extracted verbatim from `./provider-card.tsx` (rf-pset-5) as part of
 * the rf-pset series. Renders the inline "add another project" form
 * for GCP — visible only when `showAddProject === provider.id` AND
 * `provider.id === 'gcp'` (the parent guards both; this component
 * trusts that the parent renders it under those conditions).
 *
 * The form lists every `provider.configFields` entry with a
 * `new_*`-prefixed key in `state.formValues`, an "Add" submit button
 * that calls `getApi().provider.connect(...)` with the new creds, and
 * a "Cancel" button that fires `onShowAddProjectChange(null)`.
 *
 * The async submit handler is co-located with the component (the
 * source's choice — preserving the closure over the orchestrator's
 * setters means the orchestrator just passes setters down rather than
 * a single bundled `onAdd` callback). If a future refactor lifts this
 * into a shared hook, the parent's call site changes; the assertion
 * surface here stays.
 */

import { Plus, RefreshCw } from 'lucide-react';
import React from 'react';
import { getApi } from '../../../api/api-adapter';
import type { TranslatorFn } from '../hooks/use-provider-handlers';
import type { ProviderConfig, ProviderRuntimeState, ProviderStatesMap } from '../types';

export interface AddProjectFormProps {
  provider: ProviderConfig;
  state: ProviderRuntimeState;
  connecting: string | null;
  t: TranslatorFn;
  onUpdateFormValue: (providerId: string, fieldName: string, value: string) => void;
  onShowAddProjectChange: (providerId: string | null) => void;
  setProviderStates: React.Dispatch<React.SetStateAction<ProviderStatesMap>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSuccess: React.Dispatch<React.SetStateAction<string | null>>;
  setConnecting: React.Dispatch<React.SetStateAction<string | null>>;
}

export const AddProjectForm: React.FC<AddProjectFormProps> = ({
  provider,
  state,
  connecting,
  t,
  onUpdateFormValue,
  onShowAddProjectChange,
  setProviderStates,
  setError,
  setSuccess,
  setConnecting,
}) => {
  return (
    <div className="p-3 bg-muted/50 rounded-md space-y-2 border border-dashed border-border">
      <div className="text-xs font-medium text-muted-foreground">{t('providerSettings.projects.addAnother')}</div>
      {provider.configFields.map((field) => (
        <div key={field.name}>
          <label className="text-xs text-muted-foreground">{field.label}</label>
          {field.type === 'textarea' ? (
            <textarea
              value={state.formValues[`new_${field.name}`] || ''}
              onChange={(e) => onUpdateFormValue(provider.id, `new_${field.name}`, e.target.value)}
              placeholder={field.placeholder}
              rows={3}
              className="w-full mt-1 p-2 text-xs border border-input rounded-md bg-background font-mono"
            />
          ) : (
            <input
              type={field.type}
              value={state.formValues[`new_${field.name}`] || ''}
              onChange={(e) => onUpdateFormValue(provider.id, `new_${field.name}`, e.target.value)}
              placeholder={field.placeholder}
              className="w-full mt-1 p-2 text-xs border border-input rounded-md bg-background"
            />
          )}
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <button
          onClick={async () => {
            const newCreds = {
              projectId: state.formValues.new_projectId || '',
              serviceAccountKey: state.formValues.new_serviceAccountKey || '',
            };
            if (!newCreds.serviceAccountKey) {
              setError(t('providerSettings.connect.serviceAccountRequired'));
              return;
            }
            setConnecting(provider.id);
            try {
              const result = await getApi().provider.connect(provider.id, newCreds);
              if (result.success && result.projects) {
                // Add new projects to existing list
                setProviderStates((prev) => ({
                  ...prev,
                  [provider.id]: {
                    ...prev[provider.id],
                    projects: [...prev[provider.id].projects, ...result.projects],
                    formValues: {
                      ...prev[provider.id].formValues,
                      new_projectId: '',
                      new_serviceAccountKey: '',
                    },
                  },
                }));
                onShowAddProjectChange(null);
                setSuccess(t('providerSettings.projects.addedSuccess'));
              } else {
                setError(result.error || t('providerSettings.connect.failedToAdd'));
              }
            } catch (err) {
              setError(String(err));
            } finally {
              setConnecting(null);
            }
          }}
          disabled={connecting === provider.id}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {connecting === provider.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          {t('providerSettings.projects.addButton')}
        </button>
        <button onClick={() => onShowAddProjectChange(null)} className="px-3 py-1.5 text-xs rounded hover:bg-muted">
          {t('providerSettings.projects.cancelButton')}
        </button>
      </div>
    </div>
  );
};
