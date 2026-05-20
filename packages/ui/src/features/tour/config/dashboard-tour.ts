/**
 * Dashboard tour — the first thing a fresh user sees.
 *
 * Two steps: orient the user to the projects dashboard, then point at
 * the "New project" button so they have an obvious next action. After
 * they click into a project the canvas tour takes over.
 *
 * `autoStart` predicate fires the tour the first time the user lands on
 * the folder/dashboard view (root path, or any folder route — anything
 * that's not a project canvas). The runner additionally checks the
 * first step's anchor exists, so this never auto-fires against a stale
 * route during navigation.
 */
import type { Tour } from '../tour.types';

export const dashboardTour: Tour = {
  id: 'dashboard-tour',
  title: 'tour.dashboard.title',
  autoStart: ({ pathname }) => {
    // Project canvases have at least one path segment (org/project) and
    // typically more. The folder view at "/" or "/some-folder" is the
    // dashboard. We accept any path the FolderView renders for —
    // checking the anchor existence below is the real gate.
    if (pathname.startsWith('/onboarding')) return false;
    if (pathname.startsWith('/settings')) return false;
    if (pathname.startsWith('/templates')) return false;
    if (pathname.startsWith('/team')) return false;
    return true;
  },
  steps: [
    {
      id: 'dashboard-overview',
      target: '#ice-folder-panel',
      title: 'tour.dashboard.overview.title',
      body: 'tour.dashboard.overview.body',
      placement: 'auto',
      pad: 12,
    },
    {
      id: 'create-project',
      target: '#ice-folder-btn-create-project',
      title: 'tour.dashboard.createProject.title',
      body: 'tour.dashboard.createProject.body',
      placement: 'bottom',
      pad: 6,
      actions: { hideSkip: true, nextLabel: 'tour.actions.finish' },
    },
  ],
};
