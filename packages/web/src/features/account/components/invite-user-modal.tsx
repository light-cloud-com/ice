/**
 * InviteUserModal
 *
 * Modal dialog to invite a user by email with a selected role.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';
import { X, Shield, User, Eye } from 'lucide-react';
import type { RootState } from '@/store';
import axiosInstance from '@/shared/api/axios-instance';

interface Props {
  onClose: () => void;
  onInvited?: () => void;
}

const ROLES = [
  {
    value: 'admin',
    label: 'Admin',
    icon: Shield,
    description: 'Full access. Can manage users, billing, and all projects.',
  },
  {
    value: 'member',
    label: 'Member',
    icon: User,
    description: 'Can create and edit projects. Cannot manage users or billing.',
  },
  {
    value: 'viewer',
    label: 'Viewer',
    icon: Eye,
    description: 'Read-only access. Can view projects but not edit or deploy.',
  },
] as const;

export function InviteUserModal({ onClose, onInvited }: Props) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('member');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const selectedOrg = useSelector((s: RootState) => s.account.selectedOrg);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail || loading || !selectedOrg) return;

    setLoading(true);
    setError(null);

    try {
      await axiosInstance.post('/users/invite', {
        email: email.trim(),
        role,
        targetOrganisationId: selectedOrg.id,
      });

      setSuccess(true);
      onInvited?.();

      // Auto-close after a short delay
      setTimeout(() => onClose(), 1500);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to send invitation. Please try again.';
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
          <h2 className="text-lg font-semibold text-ice-text-1">Invite a team member</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-ice-text-2 hover:bg-ice-hover hover:text-ice-text-1 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Email */}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ice-text-1">Email address</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              autoFocus
              className="w-full rounded-md border border-ice-border bg-ice-base px-3 py-2 text-sm text-ice-text-1 placeholder:text-ice-text-3 focus:border-ice-accent focus:outline-none focus:ring-1 focus:ring-ice-accent transition-colors"
            />
          </label>

          {/* Role selection */}
          <div>
            <span className="mb-2 block text-sm font-medium text-ice-text-1">Role</span>
            <div className="space-y-2">
              {ROLES.map((r) => {
                const Icon = r.icon;
                const isSelected = role === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    className={`flex w-full items-start gap-3 rounded-md border px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? 'border-ice-accent bg-ice-base'
                        : 'border-ice-border bg-ice-base hover:border-ice-border-strong'
                    }`}
                  >
                    <Icon
                      className={`mt-0.5 h-4 w-4 shrink-0 ${isSelected ? 'text-ice-accent' : 'text-ice-text-2'}`}
                    />
                    <div>
                      <p
                        className={`text-sm font-medium ${isSelected ? 'text-ice-text-1' : 'text-ice-text-1'}`}
                      >
                        {r.label}
                      </p>
                      <p className="mt-0.5 text-xs text-ice-text-2">{r.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error / success */}
          {error && (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-md border border-ice-green/30 bg-ice-green/10 px-3 py-2 text-sm text-ice-green">
              Invitation sent successfully!
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-ice-border bg-ice-raised px-4 py-2 text-sm font-medium text-ice-text-1 hover:bg-ice-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValidEmail || loading || success}
              className="rounded-md bg-ice-green px-4 py-2 text-sm font-medium text-white hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Sending...' : 'Send invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
