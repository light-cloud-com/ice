/**
 * Rename Environment Modal — modal dialog for renaming an existing
 * environment. Lifted out of `environment-tab-bar.tsx` during rf-etabs-2.
 *
 * Behavior preserved verbatim: trims the input, no-op when unchanged,
 * surfaces backend errors, autoFocuses the input, supports Enter to submit
 * and click-outside to dismiss.
 */

import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useTranslation } from '../../../i18n';
import { renameEnvironment, type Environment } from '../../../store/slices/environments-slice';
import type { AppDispatch } from '../../../store';

export const RenameEnvironmentModal: React.FC<{
  env: Environment;
  projectId: string;
  onClose: () => void;
}> = ({ env, projectId, onClose }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const [name, setName] = useState(env.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('environments.renameModal.errorNameRequired'));
      return;
    }
    if (trimmed === env.name) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await dispatch(renameEnvironment({ envId: env.id, projectId, name: trimmed })).unwrap();
      onClose();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || t('environments.renameModal.errorFallback'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-[380px] bg-ice-surface border border-ice-border rounded-lg shadow-xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-ice-text-1">{t('environments.renameModal.title')}</h3>

        {error && (
          <div className="rounded bg-red-500/10 border border-red-500/20 px-3 py-2 text-ice-xs text-red-400">
            {error}
          </div>
        )}

        <div>
          <label className="text-ice-xs font-medium text-ice-text-2 block mb-1">
            {t('environments.renameModal.nameLabel')}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="w-full px-2.5 py-1.5 text-ice-sm rounded border border-ice-border bg-ice-base text-ice-text-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-ice-sm text-ice-text-3 hover:text-ice-text-2 transition-colors"
          >
            {t('environments.renameModal.cancelButton')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || name.trim() === env.name}
            className="px-3 py-1.5 text-ice-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {saving ? t('environments.renameModal.savingButton') : t('environments.renameModal.saveButton')}
          </button>
        </div>
      </div>
    </div>
  );
};
