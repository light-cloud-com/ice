/**
 * App Settings Page — Community Edition
 *
 * Tabs: Appearance · Language
 */

import { useTranslation, LOCALES, type Locale } from '@ui/i18n';
import axiosInstance from '@ui/shared/api/axios-instance';
import { useThemePicker } from '@ui/shared/components/dev-accent-picker';
import { useTheme } from '@ui/shared/hooks/use-theme';
import { cn } from '@ui/shared/utils/cn';
import { Palette, Languages, Sun, Moon, Monitor, ChevronLeft, AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type SettingsTab = 'appearance' | 'language' | 'reset';

// ─── Tab Button ─────────────────────────────────────────────────────────────

const TabButton: React.FC<{
  active: boolean;
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  'data-tour-id'?: string;
}> = ({ active, icon: Icon, label, onClick, ...rest }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
      active ? 'border-blue-500 text-ice-text-1' : 'border-transparent text-ice-text-3 hover:text-ice-text-2',
    )}
    {...rest}
  >
    <Icon className="w-3.5 h-3.5" />
    {label}
  </button>
);

// ─── Main Component ─────────────────────────────────────────────────────────

export const AppSettings: React.FC = () => {
  const { t, locale, setLocale } = useTranslation();
  const { theme, setTheme, fontSize, setFontSize } = useTheme();
  const { toggle: toggleThemePicker } = useThemePicker();
  const navigate = useNavigate();
  const [tab, setTab] = useState<SettingsTab>('appearance');
  const [confirmReset, setConfirmReset] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Browser history fallback: if the user landed here directly (no
  // history entry to pop), send them to root rather than no-op.
  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  }, [navigate]);

  const handleReset = useCallback(async () => {
    setResetting(true);
    setResetError(null);
    try {
      await axiosInstance.post('/profile/reset-workspace');
      // Full reload: dumps Redux state, re-fetches profile + cards
      // from the freshly-seeded DB, re-runs the canvas tour.
      if (typeof window !== 'undefined') {
        window.location.replace('/');
      }
    } catch (err) {
      console.error('[settings] reset failed:', err);
      setResetError('Reset failed. Check the gateway logs and try again.');
      setResetting(false);
    }
  }, []);

  return (
    <div className="max-w-3xl mx-auto py-10 px-6">
      <button
        type="button"
        onClick={handleBack}
        aria-label={t('common.buttons.back')}
        className="flex items-center gap-1 text-ice-sm text-ice-text-3 hover:text-ice-text-1 mb-4 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        {t('common.buttons.back')}
      </button>

      <h1 className="text-xl font-semibold text-ice-text-1 mb-6">{t('appSettings.title')}</h1>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-ice-border">
        <TabButton
          active={tab === 'appearance'}
          icon={Palette}
          label={t('appSettings.tabs.appearance')}
          onClick={() => setTab('appearance')}
        />
        <TabButton
          active={tab === 'language'}
          icon={Languages}
          label={t('appSettings.tabs.language')}
          onClick={() => setTab('language')}
        />
        <TabButton
          active={tab === 'reset'}
          icon={Trash2}
          label={t('appSettings.tabs.reset')}
          onClick={() => setTab('reset')}
        />
      </div>

      {/* ── Appearance Tab ──────────────────────────────────────────────── */}
      {tab === 'appearance' && (
        <div className="space-y-6">
          {/* Dark/Light Mode */}
          <div className="ice-card">
            <div className="ice-card-header">
              <h2 className="text-ice-md font-semibold text-ice-text-1">{t('appSettings.appearance.themeTitle')}</h2>
            </div>
            <div className="ice-card-body">
              <div className="flex gap-2">
                {(
                  [
                    { id: 'light', label: t('appSettings.appearance.light'), icon: Sun },
                    { id: 'dark', label: t('appSettings.appearance.dark'), icon: Moon },
                    { id: 'system', label: t('appSettings.appearance.system'), icon: Monitor },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setTheme(opt.id)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors',
                      theme === opt.id
                        ? 'border-ice-accent bg-ice-accent-muted text-ice-text-1'
                        : 'border-ice-border text-ice-text-2 hover:border-ice-border-strong hover:bg-ice-hover',
                    )}
                  >
                    <opt.icon className="w-4 h-4" />
                    <span className="text-ice-sm font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Color Theme */}
          <div className="ice-card">
            <div className="ice-card-header">
              <h2 className="text-ice-md font-semibold text-ice-text-1">{t('appSettings.appearance.colorTitle')}</h2>
              <p className="text-ice-sm text-ice-text-3 mt-1">{t('appSettings.appearance.colorDescription')}</p>
            </div>
            <div className="ice-card-body">
              <button
                onClick={toggleThemePicker}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-ice-border text-ice-text-2 hover:border-ice-border-strong hover:bg-ice-hover transition-colors"
              >
                <Palette className="w-4 h-4" />
                <span className="text-ice-sm font-medium">{t('appSettings.appearance.openThemePicker')}</span>
              </button>
            </div>
          </div>

          {/* Font Size */}
          <div className="ice-card">
            <div className="ice-card-header">
              <h2 className="text-ice-md font-semibold text-ice-text-1">{t('appSettings.appearance.fontSizeTitle')}</h2>
            </div>
            <div className="ice-card-body">
              <div className="flex gap-2">
                {(
                  [
                    { id: 'small', label: t('appSettings.appearance.small') },
                    { id: 'default', label: t('appSettings.appearance.default') },
                    { id: 'large', label: t('appSettings.appearance.large') },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setFontSize(opt.id)}
                    className={cn(
                      'px-4 py-2.5 rounded-lg border transition-colors text-ice-sm font-medium',
                      fontSize === opt.id
                        ? 'border-ice-accent bg-ice-accent-muted text-ice-text-1'
                        : 'border-ice-border text-ice-text-2 hover:border-ice-border-strong hover:bg-ice-hover',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Language Tab ─────────────────────────────────────────────────── */}
      {tab === 'language' && (
        <div className="ice-card">
          <div className="ice-card-header">
            <h2 className="text-ice-md font-semibold text-ice-text-1">{t('appSettings.language.title')}</h2>
            <p className="text-ice-sm text-ice-text-3 mt-1">{t('appSettings.language.description')}</p>
          </div>
          <div className="ice-card-body">
            <div className="flex gap-2">
              {LOCALES.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => setLocale(loc.id as Locale)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors',
                    locale === loc.id
                      ? 'border-ice-accent bg-ice-accent-muted text-ice-text-1'
                      : 'border-ice-border text-ice-text-2 hover:border-ice-border-strong hover:bg-ice-hover',
                  )}
                >
                  <span className="text-ice-sm font-medium">{loc.nativeLabel}</span>
                  <span className="text-ice-xs text-ice-text-3 uppercase">{loc.id}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Tab ────────────────────────────────────────────────────── */}
      {tab === 'reset' && (
        <div className="ice-card border-red-500/40">
          <div className="ice-card-header">
            <h2 className="text-ice-md font-semibold text-ice-text-1 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" aria-hidden="true" />
              {t('appSettings.reset.title')}
            </h2>
            <p className="text-ice-sm text-ice-text-3 mt-1">{t('appSettings.reset.description')}</p>
          </div>
          <div className="ice-card-body space-y-4">
            <ul className="text-ice-sm text-ice-text-2 space-y-1.5 list-disc pl-5">
              <li>{t('appSettings.reset.wipesProjects')}</li>
              <li>{t('appSettings.reset.wipesCredentials')}</li>
              <li>{t('appSettings.reset.wipesGithub')}</li>
              <li>{t('appSettings.reset.wipesAi')}</li>
              <li>{t('appSettings.reset.wipesTour')}</li>
            </ul>

            <label className="block">
              <span className="text-ice-sm font-medium text-ice-text-2 mb-1.5 block">
                {t('appSettings.reset.confirmLabel')}
              </span>
              <input
                type="text"
                value={confirmReset}
                onChange={(e) => setConfirmReset(e.target.value)}
                placeholder="RESET"
                className="ice-input w-full"
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            {resetError && <p className="text-sm text-red-400">{resetError}</p>}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleReset}
                disabled={resetting || confirmReset.trim().toUpperCase() !== 'RESET'}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-ice-sm font-medium transition-colors',
                  'bg-red-600 text-white hover:bg-red-500',
                  'disabled:bg-red-600/30 disabled:text-white/50 disabled:cursor-not-allowed',
                )}
              >
                {resetting ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                )}
                {resetting ? t('appSettings.reset.resetting') : t('appSettings.reset.resetButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
