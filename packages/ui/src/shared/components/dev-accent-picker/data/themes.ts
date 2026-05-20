/**
 * Dev Accent Picker — theme palette data (orchestrator).
 *
 * Module layout (rf-thmdat split):
 *   - `./themes/group-1.ts` — default, retro, cupcake, valentine
 *   - `./themes/group-2.ts` — synthwave, coffee, luxury, aqua
 *   - `./themes/group-3.ts` — forest, sage, dracula, night
 *
 *   This file assembles the three groups (4 themes each) into the public
 *   `T` array. Original ordering is preserved verbatim — the orchestrator
 *   FC consumes `T` via `T.find((t) => t.id === ...)` and `T.map(...)`,
 *   neither of which depends on order, but the storefront UI does (the
 *   palette renders in array order).
 *
 *   Types live in `../types.ts`.
 *   Helpers (`applyPalette`, `clearOverrides`, `ALL_PROPS`) live in
 *   `../utils/apply-palette.ts`.
 *   The orchestrator FC + the public re-export shim live in
 *   `../../dev-accent-picker.tsx`.
 *
 * Sources: built from real, proven palettes (daisyUI, Catppuccin, Nord, etc.)
 * Each theme has BOLD, visually distinct surface colors — not tints of gray.
 */

import { GROUP_1_THEMES } from './themes/group-1';
import { GROUP_2_THEMES } from './themes/group-2';
import { GROUP_3_THEMES } from './themes/group-3';
import type { ColorTheme } from '../types';

export const T: ColorTheme[] = [...GROUP_1_THEMES, ...GROUP_2_THEMES, ...GROUP_3_THEMES];
