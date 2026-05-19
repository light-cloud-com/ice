/**
 * Block Category Definitions — shared between resource palette and context menu
 *
 * The category id list and declaration order are locale-independent and live
 * in `BLOCK_CATEGORY_ORDER`. Labels resolve through i18n keys
 * (`blocks.categories.<id>.label` — the same keys the palette's category
 * data file uses) so the context menu submenu reads the same translated
 * label as the palette section header.
 *
 * **Locale-reactivity:** the previous module-level `BLOCK_CATEGORIES`
 * constant hard-coded English labels at import time, which then leaked
 * into the locale-switchable context menu. Now `getBlockCategories(t)`
 * and `getBlockCategoryLabel(t, raw)` are called per-render with `t`
 * from `useTranslation()` so locale changes re-derive the labels.
 */

type Translator = (key: string) => string;

export interface BlockCategoryDef {
  id: string;
  label: string;
}

/** Locale-independent ordering — context-menu submenu and palette sort by this. */
export const BLOCK_CATEGORY_ORDER = [
  'Compute',
  'Scheduler',
  'Frontend',
  'Network',
  'Database',
  'Cache',
  'Messaging',
  'Storage',
  'Security',
  'AI',
  'Analytics',
  'Monitoring',
  'Source',
  'Config',
] as const;

/** i18n key for a given category id — mirrors the palette's `blocks.categories.*` bundle. */
function categoryLabelKey(id: string): string {
  return `blocks.categories.${id.toLowerCase()}.label`;
}

/** Build the localized {id, label} list. Call from inside a React component
 *  (with `t` from `useTranslation()`) so locale changes recompute the labels. */
export function getBlockCategories(t: Translator): BlockCategoryDef[] {
  return BLOCK_CATEGORY_ORDER.map((id) => ({ id, label: t(categoryLabelKey(id)) }));
}

/** Case-insensitive lookup: returns the localized label for the given raw
 *  category string (e.g. 'compute' → 'Compute' / '计算' depending on locale).
 *  Falls back to a Title-Cased version of the raw string when no match. */
export function getBlockCategoryLabel(t: Translator, raw: string): string {
  const match = BLOCK_CATEGORY_ORDER.find((id) => id.toLowerCase() === raw.toLowerCase());
  if (match) return t(categoryLabelKey(match));
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
