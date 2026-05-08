/**
 * tour-12 — Canvas tour definition.
 *
 * The marquee onboarding tour: walks new users through the canvas, the
 * palette, search, properties, and the AI panel. Five steps total, all
 * pointing at anchors that already exist in the codebase (verified
 * during tour-1 / tour-9 — see blueprint §1.2 anchor table). Title +
 * body strings are i18n keys; see `packages/ui/src/i18n/en.json`
 * `tour.canvas.*` namespace.
 *
 * No `route:` field on any step — the canvas tour fires on the project
 * canvas page (where the runner is mounted), so navigation is a no-op.
 *
 * The terminal step (`ai-intro`) ideally runs an `onEnter` to open the
 * AI sidebar so the highlighted panel is actually visible. The current
 * `ui-slice` exposes `toggleAiChat` (toggle, not open). `showAiChat`
 * defaults to `true` in initialState, so the panel is open by default.
 * TODO(tour-13): if user has dismissed the AI panel before launching
 * the tour, the highlight will land on a hidden surface — wire a
 * dedicated `openAiChat` reducer (or compute "open if currently
 * closed") rather than blindly toggling. For v1 the panel is open by
 * default, so this is acceptable.
 */
import type { Tour } from '../tour.types';

export const canvasTour: Tour = {
  id: 'canvas-tour',
  title: 'tour.canvas.title',
  steps: [
    {
      id: 'canvas-overview',
      target: '#ice-canvas-svg',
      title: 'tour.canvas.overview.title',
      body: 'tour.canvas.overview.body',
      placement: 'auto',
      pad: 16,
    },
    {
      id: 'palette-intro',
      target: '#ice-palette-panel',
      title: 'tour.canvas.palette.title',
      body: 'tour.canvas.palette.body',
      placement: 'right',
    },
    {
      id: 'palette-search',
      target: '#ice-palette-search-input',
      title: 'tour.canvas.search.title',
      body: 'tour.canvas.search.body',
      placement: 'right',
      pad: 4,
    },
    {
      id: 'properties-intro',
      target: '#ice-properties-panel',
      title: 'tour.canvas.properties.title',
      body: 'tour.canvas.properties.body',
      placement: 'left',
    },
    {
      id: 'ai-intro',
      target: '#ice-ai-panel',
      title: 'tour.canvas.ai.title',
      body: 'tour.canvas.ai.body',
      placement: 'left',
      // TODO(tour-13): wire an `openAiChat` action (vs toggle) and call
      // it here so the panel is open even if the user previously
      // dismissed it. Today the panel is open by default and most users
      // never close it, so the v1 behavior is acceptable.
      actions: { hideSkip: true, nextLabel: 'tour.actions.finish' },
    },
  ],
};
