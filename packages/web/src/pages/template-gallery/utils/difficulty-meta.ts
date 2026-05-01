/**
 * rf-wgal-2 — getDifficultyMeta (web).
 *
 * Builder for the difficulty-tier lookup used by the web gallery's
 * `DifficultyDots`, the detail-view stats grid, AND the difficulty
 * filter chip row in the page header. Mirrors rf-tgal-2's
 * `getDifficultyLabels` shape but lives in `packages/web` because the
 * route page never imports from `@ui/features/templates`.
 *
 * Dots: 1, 2, 3, 4 — load-bearing. The `<DifficultyDots>` consumer maps
 * `[1, 2, 3, 4]` over the index and lights only those `<= info.dots`.
 */

export interface DifficultyTier {
  label: string;
  dots: number;
}

export function getDifficultyMeta(
  t: (key: string) => string,
): Record<string, DifficultyTier> {
  return {
    starter: { label: t('templates.gallery.difficultyStarter'), dots: 1 },
    intermediate: { label: t('templates.gallery.difficultyIntermediate'), dots: 2 },
    advanced: { label: t('templates.gallery.difficultyAdvanced'), dots: 3 },
    expert: { label: t('templates.gallery.difficultyExpert'), dots: 4 },
  };
}
