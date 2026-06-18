/**
 * Main Application Component — Community Edition
 *
 * Trust model (findings.md #4):
 *   This shell intentionally has NO client-side auth gate. The
 *   community edition is single-user / local-first; every route here
 *   renders unconditionally. Authorization is enforced server-side on
 *   each API request (see services/iam, packages/shared/src/auth).
 *   The only client-side redirect lives in `DynamicContent` and is a
 *   UX hint to send users into onboarding — it is NOT a security
 *   boundary. Cloud / multi-tenant editions ship a different shell
 *   that wraps this one with a token gate.
 *
 * Route-based project navigation:
 *   /                         → Home (root folder view)
 *   /folder                   → Folder contents
 *   /folder/project           → Canvas
 *   /folder/project/settings  → Project settings
 *   /folder/project/deployments → Deploy history
 *   /settings                 → Account settings
 *   /team                     → Team management
 */

// Account components not needed in community (single user)
import { DebugOverlay } from '@ui/features/debug/components/debug-overlay';
import { useDeploySubscription } from '@ui/features/deploy/hooks/use-deploy-subscription';
import { TourRunner } from '@ui/features/tour/components/tour-runner';
import { useTranslation, LocaleProvider } from '@ui/i18n';
import { TeamPage } from '@ui/features/account/components/team-page';
import { AppBar } from '@ui/shared/components/app-bar';
import { DevAccentPicker } from '@ui/shared/components/dev-accent-picker';
import { ErrorBoundary } from '@ui/shared/components/error-boundary';
import { MainLayout } from '@ui/shared/components/main-layout';
import { useMenuActions } from '@ui/shared/hooks/use-menu-actions';
import { useResolvePath } from '@ui/shared/hooks/use-resolve-path';
import { fetchProfile } from '@ui/store/slices/account-slice';
import { selectActiveCard } from '@ui/store/slices/cards-slice';
import { openDeployPanel } from '@ui/store/slices/deploy-slice';
import { initializeGraph } from '@ui/store/slices/graph-slice';
import { setActiveProject } from '@ui/store/slices/projects-slice';
import { hydrateUserPreferences } from '@ui/store/user-preferences';
import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import type { AppDispatch } from '@ui/store';
import { AppSettings } from '@/pages/app-settings';
import { FolderView } from '@/pages/folder-view';
import { ProjectActivity } from '@/pages/project/activity';
import { ProjectDeployments } from '@/pages/project/deployments';
import { ProjectSettings } from '@/pages/project/settings';
import { TemplateGalleryPage } from '@/pages/template-gallery';

// ── Template Gallery shell (full-page with AppBar + sidebars) ───────────────
const TemplateGalleryShell: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    dispatch(fetchProfile());
  }, [dispatch]);

  return (
    <div className="h-full flex flex-col bg-background">
      <AppBar />
      <MainLayout>
        <div className="h-full overflow-hidden">
          <TemplateGalleryPage />
        </div>
      </MainLayout>
    </div>
  );
};

// ── Helpers ─────────────────────────────────────────────────────────────────
/**
 * Mounted on the /deploy subpage. Dispatches openDeployPanel() so the
 * Deploy panel appears in the right sidebar (it's mounted inside
 * MainLayout alongside Cost / Properties). The panel itself owns
 * close-from-inside, but navigating away from /deploy should reset
 * the open state to keep route + panel state in sync.
 */
const DeployRouteOpener: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  useEffect(() => {
    dispatch(openDeployPanel());
  }, [dispatch]);
  return null;
};

// ── Dynamic content resolver ────────────────────────────────────────────────
const DynamicContent: React.FC = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const segments = pathname.split('/').filter(Boolean);
  const resolved = useResolvePath(segments);
  const activeCard = useSelector(selectActiveCard);

  // Cross-tab deploy visibility — subscribe to the active card's deploy
  // room and hydrate Redux with the current snapshot + persisted outputs.
  // This replaces the subscription that used to live inside DeployPanel,
  // which only ran when the panel was open.
  useDeploySubscription(activeCard?.id);

  useEffect(() => {
    dispatch(initializeGraph());
    dispatch(fetchProfile());
    // Hydrate UI panel / split-view / project-tree prefs from the DB
    // so a refresh lands the user back on the layout they had.
    void hydrateUserPreferences(dispatch);
  }, [dispatch]);

  // Sync resolved project ID into Redux so child components (AI chat) can access it
  useEffect(() => {
    if (resolved.type === 'project' && resolved.id) {
      dispatch(setActiveProject(resolved.id));
    }
  }, [resolved.type, resolved.id, dispatch]);

  useMenuActions();

  if (resolved.loading) {
    return (
      <div className="h-full flex flex-col bg-background">
        <AppBar />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-ice-border border-t-ice-accent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // ── 404 ─────────────────────────────────────────────────────────────────
  if (resolved.type === 'notFound') {
    return (
      <div className="h-full flex flex-col bg-background">
        <AppBar />
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <span className="text-6xl font-bold text-ice-text-3">{t('app.notFound.code')}</span>
          <p className="text-ice-text-2 text-sm">{t('app.notFound.message')}</p>
          <button
            onClick={() => navigate(resolved.orgPrefix || '/')}
            className="ice-btn ice-btn-primary text-ice-md mt-2"
          >
            {t('app.notFound.button')}
          </button>
        </div>
      </div>
    );
  }

  // Compute the project base path (URL without subpage)
  const projectBasePath =
    resolved.type === 'project'
      ? '/' + segments.slice(0, resolved.subpage === 'canvas' ? segments.length : segments.length - 1).join('/')
      : '';

  // ── Project views ─────────────────────────────────────────────────────
  if (resolved.type === 'project') {
    return (
      <div className="h-full flex flex-col bg-background">
        <AppBar />

        {(resolved.subpage === 'canvas' || resolved.subpage === 'table' || resolved.subpage === 'deploy') && (
          <>
            <MainLayout
              projectId={resolved.id!}
              projectName={resolved.name}
              view={resolved.subpage === 'table' ? 'table' : 'canvas'}
              basePath={projectBasePath}
            />
            <DebugOverlay />
          </>
        )}

        {resolved.subpage === 'settings' && (
          <MainLayout
            projectId={resolved.id!}
            projectName={resolved.name}
            basePath={projectBasePath}
            subpage="settings"
          >
            <div className="h-full overflow-y-auto bg-ice-base">
              <ProjectSettings projectId={resolved.id!} />
            </div>
          </MainLayout>
        )}

        {resolved.subpage === 'deployments' && (
          <MainLayout
            projectId={resolved.id!}
            projectName={resolved.name}
            basePath={projectBasePath}
            subpage="deployments"
          >
            <div className="h-full overflow-y-auto bg-ice-base">
              <ProjectDeployments projectId={resolved.id!} />
            </div>
          </MainLayout>
        )}

        {resolved.subpage === 'activity' && (
          <MainLayout
            projectId={resolved.id!}
            projectName={resolved.name}
            basePath={projectBasePath}
            subpage="activity"
          >
            <div className="h-full overflow-y-auto bg-ice-base">
              <ProjectActivity projectId={resolved.id!} />
            </div>
          </MainLayout>
        )}

        {/* On the /deploy subpage we just open the panel — the actual
            DeployPanel is mounted inside MainLayout's right sidebar and
            rendered alongside the canvas, identical to Cost / Properties. */}
        {resolved.subpage === 'deploy' && <DeployRouteOpener />}
      </div>
    );
  }

  // ── Folder or root ────────────────────────────────────────────────────
  const folderId = resolved.type === 'folder' ? resolved.id : null;
  const folderName = resolved.type === 'folder' ? resolved.name : t('app.folderView.rootName');
  const folderBasePath =
    resolved.breadcrumbs.length > 0 ? resolved.breadcrumbs[resolved.breadcrumbs.length - 1].path : resolved.orgPrefix;

  return (
    <div className="h-full flex flex-col bg-background">
      <AppBar />
      <MainLayout>
        <div className="h-full overflow-y-auto">
          <FolderView folderId={folderId} folderName={folderName} basePath={folderBasePath} />
        </div>
      </MainLayout>
    </div>
  );
};

// ── Root ─────────────────────────────────────────────────────────────────────

const App: React.FC = () => (
  <LocaleProvider>
    <ErrorBoundary name="App">
      <DevAccentPicker>
        <BrowserRouter>
          {/* TourRunner: mounted as a sibling of Routes so the popover/overlay
              portals at document.body regardless of which route is active.
              Inside BrowserRouter (needs useNavigate / useLocation), inside
              LocaleProvider (popover uses i18n), inside Provider (slice
              dispatch). See blueprint §2.1. */}
          <TourRunner />
          <Routes>
            <Route
              path="/settings"
              element={
                <ErrorBoundary name="AppSettings">
                  <div className="h-full flex flex-col bg-background">
                    <AppBar />
                    <div className="flex-1 overflow-y-auto">
                      <AppSettings />
                    </div>
                  </div>
                </ErrorBoundary>
              }
            />
            <Route
              path="/templates"
              element={
                <ErrorBoundary name="TemplateGallery">
                  <TemplateGalleryShell />
                </ErrorBoundary>
              }
            />
            {/* IA8 — the /team breadcrumb is advertised (Breadcrumbs TOP_ROUTES)
                and TeamPage is built + tested, but the route was never wired, so
                /team fell through to the catch-all and 404'd. */}
            <Route
              path="/team"
              element={
                <ErrorBoundary name="TeamPage">
                  <div className="h-full flex flex-col bg-background">
                    <AppBar />
                    <div className="flex-1 overflow-y-auto">
                      <TeamPage />
                    </div>
                  </div>
                </ErrorBoundary>
              }
            />
            <Route
              path="/*"
              element={
                <ErrorBoundary name="Canvas">
                  <DynamicContent />
                </ErrorBoundary>
              }
            />
          </Routes>
        </BrowserRouter>
      </DevAccentPicker>
    </ErrorBoundary>
  </LocaleProvider>
);

export default App;
