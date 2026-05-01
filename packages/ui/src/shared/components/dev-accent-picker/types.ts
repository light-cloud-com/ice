/**
 * Dev Accent Picker — shared types.
 *
 * Extracted verbatim from `../dev-accent-picker.tsx` as part of the rf-accent
 * series (mirroring the rf-pset / rf-pdpl / rf-rpal section pattern). These
 * are the load-bearing shapes the dev tool imports across the data table,
 * the apply-palette helper, and the orchestrator FC — keep the exports stable
 * so consumers can rely on a single source of truth.
 */

/** A complete light or dark palette — one entry per CSS custom property the
 *  dev tool overrides on `:root`. The keys are camelCase mirrors of the
 *  `--ice-*` properties applied by `applyPalette`. Adding a key here ripples
 *  through every theme entry in `T` AND through `applyPalette` / `ALL_PROPS`.
 */
export interface ThemePalette {
  base: string;
  surface: string;
  raised: string;
  overlay: string;
  hover: string;
  active: string;
  toolbar: string;
  border: string;
  borderStrong: string;
  text1: string;
  text2: string;
  text3: string;
  accent: string;
  accentHover: string;
  accentMuted: string;
  green: string;
  red: string;
  yellow: string;
}

/** A theme entry: id + display metadata + a paired light + dark palette + a
 *  three-color preview tuple `[accent, dark-surface, light-surface]` used
 *  for the swatch chips in the picker UI. */
export interface ColorTheme {
  id: string;
  name: string;
  description: string;
  light: ThemePalette;
  dark: ThemePalette;
  preview: [string, string, string]; // [accent, dark-surface, light-surface]
}
