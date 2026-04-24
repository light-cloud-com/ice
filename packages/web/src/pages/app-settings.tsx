/**
 * App Settings Page — Community Edition
 *
 * Tabs: AI · Appearance · Language
 */

import { useTranslation, LOCALES, type Locale } from '@ui/i18n';
import axiosInstance from '@ui/shared/api/axios-instance';
import { useThemePicker } from '@ui/shared/components/dev-accent-picker';
import { useTheme } from '@ui/shared/hooks/use-theme';
import { cn } from '@ui/shared/utils/cn';
import {
  Brain,
  Palette,
  Languages,
  Sun,
  Moon,
  Monitor,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Key,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

type SettingsTab = 'ai' | 'appearance' | 'language';

// ─── Tab Button ─────────────────────────────────────────────────────────────

const TabButton: React.FC<{
  active: boolean;
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}> = ({ active, icon: Icon, label, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
      active ? 'border-blue-500 text-ice-text-1' : 'border-transparent text-ice-text-3 hover:text-ice-text-2',
    )}
  >
    <Icon className="w-3.5 h-3.5" />
    {label}
  </button>
);

// ─── Main Component ─────────────────────────────────────────────────────────

export const AppSettings: React.FC = () => {
  const { t, locale, setLocale } = useTranslation();
  const { theme, setTheme, isDark, fontSize, setFontSize } = useTheme();
  const { toggle: toggleThemePicker } = useThemePicker();
  const [tab, setTab] = useState<SettingsTab>('ai');

  // AI config state
  const [anthropicKey, setAnthropicKey] = useState('');
  const [aiUrl, setAiUrl] = useState('');
  const [aiStatus, setAiStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load current AI config
  useEffect(() => {
    axiosInstance
      .get('/ai/config')
      .then((res) => {
        setAnthropicKey(res.data?.anthropicKey ? '••••••••' : '');
        setAiUrl(res.data?.aiUrl || '');
        setAiStatus(res.data?.configured ? 'connected' : 'idle');
      })
      .catch(() => setAiStatus('idle'));
  }, []);

  const handleSaveAi = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await axiosInstance.post('/ai/config', {
        ...(anthropicKey && !anthropicKey.startsWith('••') ? { anthropicKey } : {}),
        ...(aiUrl ? { aiUrl } : {}),
      });
      setMessage({ type: 'success', text: t('appSettings.ai.saved') });
      setAiStatus('connected');
    } catch {
      setMessage({ type: 'error', text: t('appSettings.ai.saveFailed') });
    }
    setSaving(false);
  };

  return (
    <div className="max-w-3xl mx-auto py-10 px-6">
      <h1 className="text-xl font-semibold text-ice-text-1 mb-6">{t('appSettings.title')}</h1>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-ice-border">
        <TabButton active={tab === 'ai'} icon={Brain} label={t('appSettings.tabs.ai')} onClick={() => setTab('ai')} />
        <TabButton active={tab === 'appearance'} icon={Palette} label={t('appSettings.tabs.appearance')} onClick={() => setTab('appearance')} />
        <TabButton active={tab === 'language'} icon={Languages} label={t('appSettings.tabs.language')} onClick={() => setTab('language')} />
      </div>

      {/* ── AI Tab ───────────────────────────────────────────────────────── */}
      {tab === 'ai' && (
        <div className="space-y-6">
          <div className="ice-card">
            <div className="ice-card-header">
              <h2 className="text-ice-md font-semibold text-ice-text-1">{t('appSettings.ai.providerTitle')}</h2>
              <p className="text-ice-sm text-ice-text-3 mt-1">
                {t('appSettings.ai.providerDescription')}
              </p>
            </div>
            <div className="ice-card-body space-y-4">
              {/* Status */}
              <div className="flex items-center gap-2 text-ice-sm">
                {aiStatus === 'connected' ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <span className="text-emerald-400 font-medium">{t('appSettings.ai.connected')}</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <span className="text-amber-400">{t('appSettings.ai.notConfigured')}</span>
                  </>
                )}
              </div>

              {/* Anthropic API Key */}
              <label className="block">
                <span className="flex items-center gap-1.5 text-ice-sm font-medium text-ice-text-2 mb-1.5">
                  <Key className="w-3.5 h-3.5" />
                  {t('appSettings.ai.anthropicKeyLabel')}
                </span>
                <input
                  type="password"
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  onFocus={() => { if (anthropicKey.startsWith('••')) setAnthropicKey(''); }}
                  placeholder="sk-ant-..."
                  className="ice-input w-full"
                />
                <p className="text-ice-xs text-ice-text-3 mt-1">
                  {t('appSettings.ai.anthropicKeyHint')}{' '}
                  <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                    console.anthropic.com
                  </a>
                </p>
              </label>

              {/* Custom AI URL */}
              <label className="block">
                <span className="text-ice-sm font-medium text-ice-text-2 mb-1.5 block">
                  {t('appSettings.ai.customEndpointLabel')}
                </span>
                <input
                  type="text"
                  value={aiUrl}
                  onChange={(e) => setAiUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1 (Ollama, LM Studio, etc.)"
                  className="ice-input w-full"
                />
                <p className="text-ice-xs text-ice-text-3 mt-1">
                  {t('appSettings.ai.customEndpointHint')}
                </p>
              </label>
            </div>
          </div>

          {message && (
            <p className={`text-sm ${message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
              {message.text}
            </p>
          )}

          <div className="flex justify-end">
            <button onClick={handleSaveAi} disabled={saving} className="ice-btn ice-btn-primary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t('common.buttons.save')}
            </button>
          </div>
        </div>
      )}

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
                {([
                  { id: 'light', label: t('appSettings.appearance.light'), icon: Sun },
                  { id: 'dark', label: t('appSettings.appearance.dark'), icon: Moon },
                  { id: 'system', label: t('appSettings.appearance.system'), icon: Monitor },
                ] as const).map((opt) => (
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
                {([
                  { id: 'small', label: t('appSettings.appearance.small') },
                  { id: 'default', label: t('appSettings.appearance.default') },
                  { id: 'large', label: t('appSettings.appearance.large') },
                ] as const).map((opt) => (
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
    </div>
  );
};
