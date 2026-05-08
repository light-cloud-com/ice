/**
 * tour-12 — Palette tour definition.
 *
 * Smaller follow-up tour after `canvas-tour`. Three steps: search,
 * provider filter, drag-and-drop hint. Demonstrates the
 * multi-anchor-source pattern called out in blueprint §1.2 — the first
 * two steps use `id`-based selectors (`#ice-palette-search-input`,
 * `#ice-palette-provider-select`), and the third targets a
 * `data-testid="block-item-..."` selector — verified to exist on
 * `packages/ui/src/features/palette/components/component-item.tsx:106`
 * — to show the engine handling test-id selectors gracefully.
 *
 * No `route` field — the palette is mounted on the same canvas surface
 * as the canvas tour. The drag-and-drop step is purely instructional;
 * the tour does not wire an `onEnter` to start a drag.
 */
import type { Tour } from '../tour.types';

export const paletteTour: Tour = {
  id: 'palette-tour',
  title: 'tour.palette.title',
  steps: [
    {
      id: 'palette-search-step',
      target: '#ice-palette-search-input',
      title: 'tour.palette.search.title',
      body: 'tour.palette.search.body',
      placement: 'right',
      pad: 4,
    },
    {
      id: 'palette-provider-filter',
      target: '#ice-palette-provider-select',
      title: 'tour.palette.providerFilter.title',
      body: 'tour.palette.providerFilter.body',
      placement: 'right',
    },
    {
      // First non-id selector — uses the test-id ALREADY in the codebase
      // (component-item.tsx:106) to show the engine resolves arbitrary
      // CSS selectors, not just `#id` strings. `[data-testid^="block-item-"]`
      // matches the FIRST block of any provider, which is what we want
      // for a generic "drag from here" hint.
      id: 'palette-drag-hint',
      target: '[data-testid^="block-item-"]',
      title: 'tour.palette.dragHint.title',
      body: 'tour.palette.dragHint.body',
      placement: 'right',
      actions: { hideSkip: true, nextLabel: 'tour.actions.finish' },
    },
  ],
};
