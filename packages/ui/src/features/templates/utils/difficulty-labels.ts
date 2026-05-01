/**
 * rf-tgal-2 — getDifficultyLabels.
 *
 * Builder for the difficulty-tier lookup used by both `DifficultyDots`
 * (the dot-strip) and the gallery detail-view stats grid. Keeps the i18n
 * call site close to the consumer — the function is invoked with the
 * `t` translator from `useTranslation()`, and the return shape is the
 * `{ label, dots }` map keyed by tier id (`starter`/`intermediate`/
 * `advanced`/`expert`).
 *
 * Dots: 1, 2, 3, 4 — load-bearing. The `<DifficultyDots>` consumer maps
 * `[1, 2, 3, 4]` over the index and lights only those `<= info.dots`.
 */

export interface DifficultyTier {
  label: string;
  dots: number;
}

export function getDifficultyLabels(
  t: (key: string) => string,
): Record<string, DifficultyTier> {
  return {
    starter: { label: t('templates.gallery.difficultyStarter'), dots: 1 },
    intermediate: { label: t('templates.gallery.difficultyIntermediate'), dots: 2 },
    advanced: { label: t('templates.gallery.difficultyAdvanced'), dots: 3 },
    expert: { label: t('templates.gallery.difficultyExpert'), dots: 4 },
  };
}
