/**
 * i18n Module
 *
 * Provides translation access via useTranslation hook and standalone t() function.
 * Supports multiple locales with React Context for runtime language switching.
 *
 * Supported locales: English (en), Mandarin Chinese (zh)
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import en from './en.json';
import zh from './zh.json';

// ─── Supported Locales ──────────────────────────────────────────────────────

export type Locale = 'en' | 'zh';

export const LOCALES: { id: Locale; label: string; nativeLabel: string }[] = [
  { id: 'en', label: 'English', nativeLabel: 'English' },
  { id: 'zh', label: 'Chinese', nativeLabel: '中文' },
];

const translations: Record<Locale, Record<string, unknown>> = { en, zh };

// ─── Types ──────────────────────────────────────────────────────────────────

type TranslationData = typeof en;

type NestedKeyOf<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object ? `${K}.${NestedKeyOf<T[K]>}` : K;
    }[keyof T & string]
  : never;

export type TranslationKey = NestedKeyOf<TranslationData>;

// ─── Core Helpers ───────────────────────────────────────────────────────────

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return path;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === 'string' ? current : path;
}

function interpolate(value: string, variables?: Record<string, string | number>): string {
  if (!variables) return value;
  let result = value;
  for (const [varKey, varValue] of Object.entries(variables)) {
    result = result.replaceAll(`{{${varKey}}}`, String(varValue));
  }
  return result;
}

function createTranslate(locale: Locale) {
  return function translate(key: string, variables?: Record<string, string | number>): string {
    const value = getNestedValue(translations[locale], key);
    return interpolate(value, variables);
  };
}

// ─── Locale Context ─────────────────────────────────────────────────────────

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, variables?: Record<string, string | number>) => string;
}

const STORAGE_KEY = 'ice-locale';

function getInitialLocale(): Locale {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'zh') return stored;
  }
  return 'en';
}

const initialLocale = getInitialLocale();
const LocaleContext = createContext<LocaleContextValue>({
  locale: initialLocale,
  setLocale: () => {},
  t: createTranslate(initialLocale),
});

/**
 * Locale provider — wrap your app root with this to enable language switching.
 *
 * Usage:
 *   <LocaleProvider>
 *     <App />
 *   </LocaleProvider>
 */
export const LocaleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(STORAGE_KEY, newLocale);
    // Update standalone t() for non-React code
    _activeLocale = newLocale;
    _activeT = createTranslate(newLocale);
  }, []);

  const tFn = useMemo(() => createTranslate(locale), [locale]);

  const value = useMemo(() => ({ locale, setLocale, t: tFn }), [locale, setLocale, tFn]);

  return React.createElement(LocaleContext.Provider, { value }, children);
};

// ─── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Translation hook.
 *
 * Returns a `t` function bound to the current locale, plus locale info.
 *
 * Usage:
 *   const { t, locale, setLocale } = useTranslation();
 *   t('common.buttons.save')       // "Save" or "保存"
 *   setLocale('zh')                // switch to Chinese
 */
export function useTranslation() {
  return useContext(LocaleContext);
}

// ─── Standalone t() ─────────────────────────────────────────────────────────

// Mutable ref for non-React contexts (Redux slices, class components, etc.)
let _activeLocale: Locale = initialLocale;
let _activeT = createTranslate(initialLocale);

/**
 * Standalone translation function.
 *
 * Use in class components, Redux slices, module-scope constants,
 * or anywhere React hooks cannot be called.
 *
 * Note: This uses the last locale set via LocaleProvider.
 * It will update when setLocale is called.
 */
export function t(key: string, variables?: Record<string, string | number>): string {
  return _activeT(key, variables);
}

/**
 * Get the current active locale (for non-React contexts).
 */
export function getLocale(): Locale {
  return _activeLocale;
}
