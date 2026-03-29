/**
 * UserSettingsPage — Community Edition
 *
 * Profile name editing only. No password management (no auth in community).
 */

import { Save, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from '../../../i18n';
import axiosInstance from '../../../shared/api/axios-instance';
import { fetchProfile } from '../../../store/slices/account-slice';
import type { RootState, AppDispatch } from '../../../store';

export function UserSettingsPage() {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector((s: RootState) => s.account.user);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      setProfileMessage({ type: 'success', text: t('account.settings.profileSaved') });
      dispatch(fetchProfile());
    } catch {
      setProfileMessage({ type: 'error', text: t('account.settings.profileSaveFailed') });
    } finally {
      setProfileLoading(false);
    }
  };

  return (
    <div id="ice-settings-panel" className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-8 text-2xl font-bold text-ice-text-1">{t('account.settings.title')}</h1>

      {/* Profile Section */}
      <section className="rounded-lg border border-ice-border bg-ice-raised">
        <div className="border-b border-ice-border px-6 py-4">
          <h2 className="text-lg font-semibold text-ice-text-1">{t('account.settings.profileTitle')}</h2>
          <p className="mt-1 text-sm text-ice-text-3">{t('account.settings.profileSubtitle')}</p>
        </div>

        <form onSubmit={handleProfileSave} className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ice-text-2">{t('account.settings.firstNameLabel')}</span>
              <input
                id="ice-settings-input-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-md border border-ice-border bg-ice-surface px-3 py-2 text-sm text-ice-text-1 placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff] transition-colors"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ice-text-2">{t('account.settings.lastNameLabel')}</span>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-md border border-ice-border bg-ice-surface px-3 py-2 text-sm text-ice-text-1 placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none focus:ring-1 focus:ring-[#58a6ff] transition-colors"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ice-text-2">{t('account.settings.emailLabel')}</span>
            <input
              type="email"
              value={user?.email ?? ''}
              disabled
              className="w-full rounded-md border border-ice-border bg-ice-surface px-3 py-2 text-sm text-ice-text-3 cursor-not-allowed"
            />
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
              {profileLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t('account.settings.saveProfileButton')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
