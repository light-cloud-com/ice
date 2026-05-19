/**
 * Canvas tour — the single comprehensive product tour.
 *
 * Walks the user through every panel on both sidebars, the cloud +
 * git integration buttons, and the deploy entry point. Order is
 * top-to-bottom / left-to-right so it reads naturally as you advance.
 *
 * Anchor visibility is guaranteed by `use-canvas-tour-panels.ts`:
 * before each step we dispatch the right `setShow*(true)` actions so
 * the spotlight target is in the DOM when the resolver runs. The
 * pre-tour panel layout is snapshotted on entry and restored on exit
 * (finish, skip, stop, escape) so the user's UI isn't permanently
 * rearranged.
 */
import type { Tour } from '../tour.types';

export const canvasTour: Tour = {
  id: 'canvas-tour',
  title: 'tour.canvas.title',
  // Auto-fire when the user is on a project canvas. The pathname
  // filter excludes ancillary routes; the runner additionally checks
  // the first step's anchor before firing, so the predicate is just a
  // coarse gate.
  autoStart: ({ pathname }) => {
    if (pathname.startsWith('/onboarding')) return false;
    if (pathname.startsWith('/settings')) return false;
    if (pathname.startsWith('/templates')) return false;
    if (pathname.startsWith('/team')) return false;
    return true;
  },
  steps: [
    // ── 1. Canvas itself ───────────────────────────────────────────
    {
      id: 'canvas-overview',
      target: '#ice-canvas-svg',
      title: 'tour.canvas.overview.title',
      body: 'tour.canvas.overview.body',
      placement: 'auto',
      pad: 16,
    },
    // ── 2. Left sidebar — Projects ─────────────────────────────────
    {
      id: 'projects',
      target: '#ice-palette-projects-section',
      title: 'tour.canvas.projects.title',
      body: 'tour.canvas.projects.body',
      placement: 'right',
      pad: 6,
    },
    // ── 3. Left sidebar — Blocks ───────────────────────────────────
    {
      id: 'blocks',
      target: '#ice-palette-blocks-section',
      title: 'tour.canvas.blocks.title',
      body: 'tour.canvas.blocks.body',
      placement: 'right',
      pad: 6,
    },
    // ── 4. Left sidebar — Templates ────────────────────────────────
    {
      id: 'templates',
      target: '#ice-palette-templates-section',
      title: 'tour.canvas.templates.title',
      body: 'tour.canvas.templates.body',
      placement: 'right',
      pad: 6,
    },
    // ── 5. Right sidebar — Properties ──────────────────────────────
    {
      id: 'properties',
      target: '#ice-properties-panel',
      title: 'tour.canvas.properties.title',
      body: 'tour.canvas.properties.body',
      placement: 'left',
    },
    // ── 6. Right sidebar — AI assistant ────────────────────────────
    {
      id: 'ai',
      target: '#ice-ai-panel',
      title: 'tour.canvas.ai.title',
      body: 'tour.canvas.ai.body',
      placement: 'left',
    },
    // ── 7. Right sidebar — Cost ────────────────────────────────────
    {
      id: 'cost',
      target: '#ice-cost-panel',
      title: 'tour.canvas.cost.title',
      body: 'tour.canvas.cost.body',
      placement: 'left',
    },
    // ── 8. Top bar — Cloud integration ─────────────────────────────
    {
      id: 'integration-cloud',
      target: '#ice-appbar-btn-gcp',
      title: 'tour.canvas.cloud.title',
      body: 'tour.canvas.cloud.body',
      placement: 'bottom',
      pad: 4,
    },
    // ── 9. Top bar — GitHub ───────────────────────────────────────
    {
      id: 'integration-github',
      target: '#ice-appbar-btn-github',
      title: 'tour.canvas.github.title',
      body: 'tour.canvas.github.body',
      placement: 'bottom',
      pad: 4,
    },
    // ── 10. Deploy ─────────────────────────────────────────────────
    {
      id: 'deploy',
      target: '#ice-btn-deploy',
      title: 'tour.canvas.deploy.title',
      body: 'tour.canvas.deploy.body',
      placement: 'bottom',
      pad: 4,
      actions: { hideSkip: true, nextLabel: 'tour.actions.finish' },
    },
  ],
};
