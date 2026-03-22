/**
 * i18n Module
 *
 * Provides translation access via useTranslation hook.
 * Currently single-language (English), but strings are extracted
 * for consistency and future localization support.
 */

import en from './en.json';

type TranslationData = typeof en;

type NestedKeyOf<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object ? `${K}.${NestedKeyOf<T[K]>}` : K;
    }[keyof T & string]
  : never;

export type TranslationKey = NestedKeyOf<TranslationData>;

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

/**
 * Translation hook.
 *
 * Returns a `t` function that resolves dot-notation keys
 * against the current locale's translation file.
 *
 * Usage:
 *   const { t } = useTranslation();
 *   t('common.buttons.save')       // "Save"
 *   t('deploy.title')              // "Deploy to GCP"
 */
export function useTranslation() {
  const translations: Record<string, unknown> = en;

  function t(key: string, variables?: Record<string, string | number>): string {
    let value = getNestedValue(translations, key);

    if (variables) {
      for (const [varKey, varValue] of Object.entries(variables)) {
        value = value.replace(`{{${varKey}}}`, String(varValue));
      }
    }

    return value;
  }

  return { t };
}

// Re-export the messages module for backward compatibility during migration
export * from './messages.js';
