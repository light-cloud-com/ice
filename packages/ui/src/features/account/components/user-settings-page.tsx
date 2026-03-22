/**
 * UserSettingsPage
 *
 * Full-page user settings: profile (name) and password management.
 */

import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Save, Loader2 } from 'lucide-react';
import type { RootState, AppDispatch } from '../../../store';
import { fetchProfile } from '../../../store/slices/account-slice';
import axiosInstance from '../../../shared/api/axios-instance';

export function UserSettingsPage() {
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector((s: RootState) => s.account.user);

  // Profile state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Populate fields from user profile
  useEffect(() => {
    if (user?.name) {
      const parts = user.name.split(' ');
      setFirstName(parts[0] ?? '');
      setLastName(parts.slice(1).join(' '));
    }
  }, [user?.name]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) return;

    setProfileLoading(true);
    setProfileMessage(null);

    try {
      await axiosInstance.put('/profile/name', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      setProfileMessage({ type: 'success', text: 'Profile updated successfully.' });
      dispatch(fetchProfile());
    } catch {
      setProfileMessage({ type: 'error', text: 'Failed to update profile. Please try again.' });
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword.length < 8) {
      setPasswordMessage({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    setPasswordLoading(true);

    try {
      await axiosInstance.put('/profile/password', {
        currentPassword,
        newPassword,
      });
      setPasswordMessage({ type: 'success', text: 'Password changed successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setPasswordMessage({ type: 'error', text: 'Failed to change password. Check your current password.' });
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div id="ice-settings-panel" className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-8 text-2xl font-bold text-ice-text-1">Settings</h1>

      {/* Profile Section */}
      <section className="mb-10 rounded-lg border border-ice-border bg-ice-raised">
        <div className="border-b border-ice-border px-6 py-4">
          <h2 className="text-lg font-semibold text-ice-text-1">Profile</h2>
          <p className="mt-1 text-sm text-ice-text-3">Update your personal information.</p>
        </div>

        <form onSubmit={handleProfileSave} className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ice-text-2">First name</span>
              <input
                id="ice-settings-input-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-md border border-ice-border bg-ice-surface px-3 py-2 text-sm text-ice-text-1 placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff] transition-colors"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ice-text-2">Last name</span>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-md border border-ice-border bg-ice-surface px-3 py-2 text-sm text-ice-text-1 placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff] transition-colors"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ice-text-2">Email</span>
            <input
              type="email"
              value={user?.email ?? ''}
              disabled
              className="w-full rounded-md border border-ice-border bg-ice-surface px-3 py-2 text-sm text-ice-text-3 cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-ice-text-3">Email cannot be changed.</p>
          </label>

          {profileMessage && (
            <p
              className={`rounded-md border px-3 py-2 text-sm ${
                profileMessage.type === 'success'
                  ? 'border-[#238636]/30 bg-ice-accent/10 text-[#3fb950]'
                  : 'border-red-500/30 bg-red-500/10 text-red-400'
              }`}
            >
              {profileMessage.text}
            </p>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={profileLoading || !firstName.trim()}
              className="flex items-center gap-2 rounded-md bg-ice-accent px-4 py-2 text-sm font-medium text-ice-text-1 hover:bg-ice-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {profileLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save profile
            </button>
          </div>
        </form>
      </section>

      {/* Password Section */}
      <section className="rounded-lg border border-ice-border bg-ice-raised">
        <div className="border-b border-ice-border px-6 py-4">
          <h2 className="text-lg font-semibold text-ice-text-1">Password</h2>
          <p className="mt-1 text-sm text-ice-text-3">Change your account password.</p>
        </div>

        <form onSubmit={handlePasswordSave} className="space-y-4 px-6 py-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ice-text-2">
              Current password
            </span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-md border border-ice-border bg-ice-surface px-3 py-2 text-sm text-ice-text-1 placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff] transition-colors"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ice-text-2">New password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-md border border-ice-border bg-ice-surface px-3 py-2 text-sm text-ice-text-1 placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff] transition-colors"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ice-text-2">
              Confirm new password
            </span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-md border border-ice-border bg-ice-surface px-3 py-2 text-sm text-ice-text-1 placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff] transition-colors"
            />
          </label>

          {passwordMessage && (
            <p
              className={`rounded-md border px-3 py-2 text-sm ${
                passwordMessage.type === 'success'
                  ? 'border-[#238636]/30 bg-ice-accent/10 text-[#3fb950]'
                  : 'border-red-500/30 bg-red-500/10 text-red-400'
              }`}
            >
              {passwordMessage.text}
            </p>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword}
              className="flex items-center gap-2 rounded-md bg-ice-accent px-4 py-2 text-sm font-medium text-ice-text-1 hover:bg-ice-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {passwordLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Change password
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
