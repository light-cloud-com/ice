/**
 * Main Application Component
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

import React, { useEffect, useState } from 'react';
import { ErrorBoundary } from '@ui/shared/components/error-boundary';
import { AppBar } from '@ui/shared/components/app-bar';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { PenTool, Table2, PanelLeftClose, PanelLeft } from 'lucide-react';
import { MainLayout } from '@ui/shared/components/main-layout';
import { ProjectWizard } from '@ui/features/wizard';
import { DebugOverlay } from '@ui/features/debug/components/debug-overlay';
import { useMenuActions } from '@ui/shared/hooks/use-menu-actions';
import { useResolvePath } from '@ui/shared/hooks/use-resolve-path';
import { initializeGraph } from '@ui/store/slices/graph-slice';
import { togglePalette } from '@ui/store/slices/ui-slice';
import { fetchProfile } from '@ui/store/slices/account-slice';
import { setActiveProject } from '@ui/store/slices/projects-slice';
import { isAuthenticated } from '@ui/shared/api/auth';
import { LoginPage } from '../pages/login';
import { SignupPage } from '../pages/signup';
import { AuthCallbackPage } from '../pages/auth-callback';
import { FolderView } from '../pages/folder-view';
import { ProjectCanvas } from '../pages/project/canvas';
import { ProjectSettings } from '../pages/project/settings';
import { ProjectDeployments } from '../pages/project/deployments';
import { ProjectTableView } from '../pages/project/table-view';
import { UserSettingsPage, TeamPage } from '@ui/features/account/components';
import { OnboardingPage, OnboardingChecklist } from '@ui/features/onboarding';
import { InviteAcceptPage } from '../pages/invite-accept';
import { EnvironmentTabBar } from '@ui/features/environments/components/environment-tab-bar';
import { cn } from '@ui/shared/utils/cn';
import type { RootState, AppDispatch } from '@ui/store';

// ── Auth ────────────────────────────────────────────────────────────────────

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

// ── App Bar ─────────────────────────────────────────────────────────────────

// ── Project tab bar ─────────────────────────────────────────────────────────

const PROJECT_TABS = [
  { id: 'canvas', label: 'Canvas' },
  { id: 'table', label: 'Table' },
  { id: 'settings', label: 'Settings' },
  { id: 'deployments', label: 'Deployments' },
];

const ProjectTabBar: React.FC<{ basePath: string; activeTab: string }> = ({ basePath, activeTab }) => {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const showPalette = useSelector((s: RootState) => s.ui.showPalette);

  return (
    <div className="h-9 flex items-center px-3 border-b border-ice-border bg-ice-surface shrink-0">
      {/* Sidebar toggle */}
      <button
        onClick={() => dispatch(togglePalette())}
        title={showPalette ? 'Hide sidebar' : 'Show sidebar'}
        className="p-1 rounded text-ice-text-3 hover:text-ice-text-1 hover:bg-ice-hover transition-colors mr-1"
      >
        {showPalette ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
      </button>

      <BarSep />

      {/* Left: page tabs */}
      <div className="flex items-center gap-0.5">
        {PROJECT_TABS.filter((t) => t.id !== 'canvas' && t.id !== 'table').map((tab) => {
          const isActive = tab.id === activeTab;
          const path = `${basePath}/${tab.id}`;
          return (
            <button
              key={tab.id}
              onClick={() => navigate(path)}
              className={cn(
                'px-3 py-1 text-ice-base font-medium rounded transition-colors',
                isActive ? 'bg-ice-active text-ice-text-1' : 'text-ice-text-3 hover:text-ice-text-2 hover:bg-ice-hover',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      {/* Right: Canvas / Table view toggle */}
      <div className="flex items-center gap-px p-0.5 rounded-md bg-ice-hover">
        <button
          onClick={() => navigate(basePath)}
          className={cn(
            'flex items-center gap-1 px-2 py-1 text-ice-sm font-medium rounded transition-colors',
            activeTab === 'canvas'
              ? 'bg-ice-active text-ice-text-1 shadow-sm'
              : 'text-ice-text-3 hover:text-ice-text-2',
          )}
        >
          <PenTool className="w-3 h-3" />
          Canvas
        </button>
        <button
          onClick={() => navigate(`${basePath}/table`)}
          className={cn(
            'flex items-center gap-1 px-2 py-1 text-ice-sm font-medium rounded transition-colors',
            activeTab === 'table' ? 'bg-ice-active text-ice-text-1 shadow-sm' : 'text-ice-text-3 hover:text-ice-text-2',
          )}
        >
          <Table2 className="w-3 h-3" />
          Table
        </button>
      </div>
    </div>
  );
};

// ── Dynamic content resolver ────────────────────────────────────────────────

const DynamicContent: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const segments = pathname.split('/').filter(Boolean);
  const resolved = useResolvePath(segments);
  const user = useSelector((s: RootState) => s.account.user);

  useEffect(() => {
    dispatch(initializeGraph());
    dispatch(fetchProfile());
  }, [dispatch]);

  // Redirect to onboarding if user hasn't completed it
  useEffect(() => {
    if (user && user.onboardingCompleted === false) {
      navigate('/onboarding', { replace: true });
    }
  }, [user, navigate]);

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
          <span className="text-6xl font-bold text-ice-text-3">404</span>
          <p className="text-ice-text-2 text-sm">This page doesn't exist</p>
          <button
            onClick={() => navigate(resolved.orgPrefix || '/')}
            className="ice-btn ice-btn-primary text-ice-md mt-2"
          >
            Go home
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
        <EnvironmentTabBar projectId={resolved.id!} basePath={projectBasePath} />

        {(resolved.subpage === 'canvas' || resolved.subpage === 'table') && (
          <>
            <MainLayout
              projectId={resolved.id!}
              projectName={resolved.name}
              view={resolved.subpage as 'canvas' | 'table'}
            />
            <ProjectWizard />
            <DebugOverlay />
          </>
        )}

        {resolved.subpage === 'settings' && (
          <MainLayout projectId={resolved.id!} projectName={resolved.name}>
            <div className="h-full overflow-y-auto bg-ice-base">
              <ProjectSettings projectId={resolved.id!} />
            </div>
          </MainLayout>
        )}

        {resolved.subpage === 'deployments' && (
          <MainLayout projectId={resolved.id!} projectName={resolved.name}>
            <div className="h-full overflow-y-auto bg-ice-base">
              <ProjectDeployments projectId={resolved.id!} />
            </div>
          </MainLayout>
        )}
      </div>
    );
  }

  // ── Folder or root ────────────────────────────────────────────────────
  const folderId = resolved.type === 'folder' ? resolved.id : null;
  const folderName = resolved.type === 'folder' ? resolved.name : 'Projects';
  // basePath = the URL path for this folder (from resolved breadcrumbs), always includes org prefix
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
      <OnboardingChecklist />
    </div>
  );
};

// ── Page layout for account pages ───────────────────────────────────────────

const PageLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // FE-8: fetchProfile is dispatched once at DynamicContent level via account-slice thunk idempotency
  const dispatch = useDispatch<AppDispatch>();
  const user = useSelector((s: RootState) => s.account.user);
  useEffect(() => {
    if (!user) dispatch(fetchProfile());
  }, [dispatch, user]);

  return (
    <div className="h-full flex flex-col bg-ice-surface">
      <AppBar />
      <div className="flex-1 overflow-y-auto p-8">{children}</div>
    </div>
  );
};

// ── Root ─────────────────────────────────────────────────────────────────────

const App: React.FC = () => (
  <ErrorBoundary name="App">
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <OnboardingPage />
            </ProtectedRoute>
          }
        />
        <Route path="/invite/:token" element={<InviteAcceptPage />} />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <PageLayout>
                <UserSettingsPage />
              </PageLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/team"
          element={
            <ProtectedRoute>
              <PageLayout>
                <TeamPage />
              </PageLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <ErrorBoundary name="Canvas">
                <DynamicContent />
              </ErrorBoundary>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  </ErrorBoundary>
);

export default App;
