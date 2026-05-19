/**
 * Create Environment Modal — modal dialog for creating a new environment.
 * Lifted out of `environment-tab-bar.tsx` during rf-etabs-2.
 *
 * Behavior preserved verbatim: validates a non-empty name, dispatches the
 * createEnvironment thunk, surfaces backend errors, autoFocuses the input,
 * supports Enter to submit and click-outside to dismiss. Type defaults to
 * 'staging' with a select between staging/development/pr.
 */

import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from '../../../i18n';
import { IceSelect } from '../../../shared/components/ui/ice-select';
import { createEnvironment } from '../../../store/slices/environments-slice';
import type { AppDispatch } from '../../../store';

export const CreateEnvironmentModal: React.FC<{
  projectId: string;
  onClose: () => void;
}> = ({ projectId, onClose }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('staging');
  const [region, setRegion] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError(t('environments.createModal.errorNameRequired'));
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await dispatch(createEnvironment({ projectId, name: name.trim(), type, region: region || undefined })).unwrap();
      onClose();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || t('environments.createModal.errorFallback'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-[380px] bg-ice-surface border border-ice-border rounded-lg shadow-xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-ice-text-1">{t('environments.createModal.title')}</h3>
        <p className="text-ice-xs text-ice-text-3">{t('environments.createModal.description')}</p>

        {error && (
          <div className="rounded bg-red-500/10 border border-red-500/20 px-3 py-2 text-ice-xs text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-ice-xs font-medium text-ice-text-2 block mb-1">
              {t('environments.createModal.nameLabel')}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('environments.createModal.namePlaceholder')}
              autoFocus
              className="w-full px-2.5 py-1.5 text-ice-sm rounded border border-ice-border bg-ice-base text-ice-text-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>

          <div>
            <label className="text-ice-xs font-medium text-ice-text-2 block mb-1">
              {t('environments.createModal.typeLabel')}
            </label>
            <IceSelect
              value={type}
              onChange={setType}
              size="md"
              fullWidth
              allowEmpty={false}
              options={[
                { value: 'staging', label: t('environments.createModal.typeStaging') },
                { value: 'development', label: t('environments.createModal.typeDevelopment') },
                { value: 'pr', label: t('environments.createModal.typePrPreview') },
              ]}
            />
          </div>

          <div>
            <label className="text-ice-xs font-medium text-ice-text-2 block mb-1">
              {t('environments.createModal.regionLabel')}
            </label>
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder={t('environments.createModal.regionPlaceholder')}
              className="w-full px-2.5 py-1.5 text-ice-sm rounded border border-ice-border bg-ice-base text-ice-text-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-ice-sm text-ice-text-3 hover:text-ice-text-2 transition-colors"
          >
            {t('environments.createModal.cancelButton')}
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="px-3 py-1.5 text-ice-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {creating ? t('environments.createModal.creatingButton') : t('environments.createModal.createButton')}
          </button>
        </div>
      </div>
    </div>
  );
};
