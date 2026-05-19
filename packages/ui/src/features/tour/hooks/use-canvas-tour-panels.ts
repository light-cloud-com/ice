/**
 * Open every panel for the canvas tour, snapshot the user's pre-tour
 * layout on entry, restore on exit.
 *
 * Earlier iterations toggled panels per step (open the one being
 * highlighted, close the rest). That fought with the user's mental
 * model — they wanted to see the whole UI at once and have the
 * spotlight tour them through it. So now: open everything on tour
 * start, leave it open, and put the user's old layout back when the
 * tour ends (finish, skip, stop, escape).
 *
 * Also responsible for navigating to the user's first project when the
 * canvas tour starts off-canvas — the canvas tour's anchors don't
 * exist on the dashboard, so without this the tour would abort with
 * "target missing" on step 0.
 */
import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';

import type { AppDispatch, RootState } from '../../../store';
import { toSlug } from '../../../shared/utils/slug';
import {
  setShowAiChat,
  setShowBlocks,
  setShowCostPanel,
  setShowPalette,
  setShowProperties,
  setShowTemplates,
  setSidebarOverride,
} from '../../../store/slices/ui-slice';

// Mirror the maxWidth constants from `main-layout.tsx`'s DragResizePanel
// instances. Bumping these here without updating main-layout would
// clamp at the panel's `maxWidth` — keep them in sync.
const SIDEBAR_MAX_LEFT = 400;
const SIDEBAR_MAX_RIGHT = 500;
import { selectActiveTourId } from '../store/tour-slice';

const CANVAS_TOUR_ID = 'canvas-tour';

interface PanelSnapshot {
  /** Projects section in the left sidebar (the Redux name is misleading). */
  showPalette: boolean;
  showBlocks: boolean;
  showTemplates: boolean;
  showProperties: boolean;
  showAiChat: boolean;
  showCostPanel: boolean;
}

const ALL_OPEN: PanelSnapshot = {
  showPalette: true,
  showBlocks: true,
  showTemplates: true,
  showProperties: true,
  showAiChat: true,
  showCostPanel: true,
};

function dispatchLayout(dispatch: AppDispatch, layout: PanelSnapshot): void {
  dispatch(setShowPalette(layout.showPalette));
  dispatch(setShowBlocks(layout.showBlocks));
  dispatch(setShowTemplates(layout.showTemplates));
  dispatch(setShowProperties(layout.showProperties));
  dispatch(setShowAiChat(layout.showAiChat));
  dispatch(setShowCostPanel(layout.showCostPanel));
}

/**
 * Find the user's first project URL. Returns null when the user has no
 * projects yet (the dashboard tour's "create project" step covers that
 * case — no need to fabricate a demo here).
 */
function firstProjectUrl(state: RootState): string | null {
  const selectedOrg = state.account?.selectedOrg;
  const projects = state.projects?.projects ?? [];
  if (!selectedOrg) return null;
  const first = projects.find((p) => !!p.id);
  if (!first) return null;
  const orgSlug = toSlug(selectedOrg.name);
  // Some projects already carry a slug; fall back to slugifying the name.
  const projectSlug = (first as { slug?: string }).slug ?? toSlug(first.name);
  return `/${orgSlug}/${projectSlug}`;
}

export function useCanvasTourPanels(): void {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const location = useLocation();
  const activeTourId = useSelector(selectActiveTourId);
  const ui = useSelector((s: RootState) => s.ui);
  const firstUrl = useSelector(firstProjectUrl);

  const snapshotRef = useRef<PanelSnapshot | null>(null);

  useEffect(() => {
    if (activeTourId !== CANVAS_TOUR_ID) {
      // Tour ended — restore the user's pre-tour layout if we snapshotted.
      if (snapshotRef.current) {
        dispatchLayout(dispatch, snapshotRef.current);
        snapshotRef.current = null;
      }
      // Always clear sidebar overrides on exit, even if we never snapshotted
      // (defensive — covers the case where snapshotting was skipped because
      // ui was unavailable mid-mount).
      dispatch(setSidebarOverride({ side: 'left', width: null }));
      dispatch(setSidebarOverride({ side: 'right', width: null }));
      return;
    }
    // Already snapshotted — don't re-snapshot mid-tour or we'd capture
    // the all-open layout we just installed.
    if (snapshotRef.current) return;
    if (!ui) return;

    snapshotRef.current = {
      showPalette: ui.showPalette,
      showBlocks: ui.showBlocks,
      showTemplates: ui.showTemplates,
      showProperties: ui.showProperties,
      showAiChat: ui.showAiChat,
      showCostPanel: ui.showCostPanel,
    };
    dispatchLayout(dispatch, ALL_OPEN);
    // Push both sidebars to their max width so the tour content has
    // room. Cleared on exit (above).
    dispatch(setSidebarOverride({ side: 'left', width: SIDEBAR_MAX_LEFT }));
    dispatch(setSidebarOverride({ side: 'right', width: SIDEBAR_MAX_RIGHT }));

    // If we're not on a project canvas, navigate to the user's first
    // project so the canvas anchors mount. The autostart predicate
    // already filters out non-canvas pathnames for canvas-tour, so this
    // path normally fires only when the tour was launched manually
    // from the Help menu / OnboardingChecklist.
    if (firstUrl && !location.pathname.match(/^\/[^/]+\/[^/]+/)) {
      navigate(firstUrl);
    }
    // ui / firstUrl / location are intentionally NOT in deps — we want
    // this to run exactly once per tour entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTourId, dispatch, navigate]);
}
