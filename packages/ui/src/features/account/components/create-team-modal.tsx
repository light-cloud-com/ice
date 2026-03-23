/**
 * CreateTeamModal
 *
 * Modal dialog to create a new team/organisation.
 * Uses createPortal to render a fixed overlay.
 */

import { X } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch } from 'react-redux';
import axiosInstance from '../../../shared/api/axios-instance';
import { addOrganisation, switchOrganisation } from '../../../store/slices/account-slice';
import type { AppDispatch } from '../../../store';

interface Props {
  onClose: () => void;
}

export function CreateTeamModal({ onClose }: Props) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dispatch = useDispatch<AppDispatch>();

  const isValid = name.trim().length >= 2 && name.trim().length <= 50;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await axiosInstance.post('/organisations/create', {
        name: name.trim(),
      });

      const newOrg = {
        id: response.data.id,
        name: response.data.name ?? name.trim(),
        role: 'Admin',
      };

      dispatch(addOrganisation(newOrg));
      dispatch(switchOrganisation(newOrg));
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create team. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-lg border border-ice-border bg-ice-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ice-border px-6 py-4">
          <h2 className="text-lg font-semibold text-ice-text-1">Create a new team</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-ice-text-2 hover:bg-ice-hover hover:text-ice-text-1 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ice-text-1">Team name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp"
              minLength={2}
              maxLength={50}
              autoFocus
              className="w-full rounded-md border border-ice-border bg-ice-base px-3 py-2 text-sm text-ice-text-1 placeholder:text-ice-text-3 focus:border-ice-accent focus:outline-none focus:ring-1 focus:ring-ice-accent transition-colors"
            />
          </label>

          <p className="mt-1.5 text-xs text-ice-text-2">Between 2 and 50 characters. You can change this later.</p>

          {error && (
            <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-ice-border bg-ice-raised px-4 py-2 text-sm font-medium text-ice-text-1 hover:bg-ice-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || loading}
              className="rounded-md bg-ice-green px-4 py-2 text-sm font-medium text-white hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : 'Create team'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
