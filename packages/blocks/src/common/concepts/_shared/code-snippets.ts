/**
 * Concepts Palette — code snippets helper
 *
 * Thin helper for defining per-concept code snippets. Kept as a function
 * rather than a plain object so `defineSnippets({...})` reads naturally
 * at concept definition sites.
 */

import type { SnippetLanguage } from './types';

/**
 * Define a partial snippets record. TypeScript enforces that only valid
 * SnippetLanguage keys are used; Partial lets concepts ship with a subset
 * of languages and backfill later.
 */
export function defineSnippets(snippets: Partial<Record<SnippetLanguage, string>>): Partial<Record<SnippetLanguage, string>> {
  return snippets;
}
