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
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { LayoutGrid, Rocket, Sun, Moon, PenTool, Table2, PanelLeftClose, PanelLeft, Github, Undo2, Redo2 } from 'lucide-react';
import { MainLayout } from '../shared/components/main-layout';
import { ProjectWizard } from '../features/wizard';
import { DebugOverlay } from '../features/debug/components/debug-overlay';
import { useMenuActions } from '../shared/hooks/use-menu-actions';
import { useTheme } from '../shared/hooks/use-theme';
import { useResolvePath } from '../shared/hooks/use-resolve-path';
import { initializeGraph } from '../store/slices/graph-slice';
import { togglePalette } from '../store/slices/ui-slice';
import { autoOrganizeCard, undoCardChange, redoCardChange, selectCanUndo, selectCanRedo } from '../store/slices/cards-slice';
import { openDeployPanel } from '../store/slices/deploy-slice';
import { fetchProfile } from '../store/slices/account-slice';
import { setActiveProject } from '../store/slices/projects-slice';
import { isAuthenticated } from '../shared/api/auth';
import { LoginPage } from '../pages/login';
import { SignupPage } from '../pages/signup';
import { AuthCallbackPage } from '../pages/auth-callback';
import { FolderView } from '../pages/folder-view';
import { ProjectCanvas } from '../pages/project/canvas';
import { ProjectSettings } from '../pages/project/settings';
import { ProjectDeployments } from '../pages/project/deployments';
import { ProjectTableView } from '../pages/project/table-view';
import { UserSettingsPage, TeamPage, ProfileAvatar } from '../features/account/components';
import { OnboardingPage, OnboardingChecklist } from '../features/onboarding';
import { InviteAcceptPage } from '../pages/invite-accept';
import { Breadcrumbs } from '../shared/components/breadcrumbs';
import { GitHubConnectModal } from '../features/integrations/components/github-connect-modal';
import { ProviderConnectModal } from '../features/integrations/components/provider-connect-modal';
import { DeployPanel } from '../features/deploy/components/deploy-panel';
import { EnvironmentTabBar } from '../features/environments/components/environment-tab-bar';
import { PromoteModal } from '../features/environments/components/promote-modal';
import { checkGitHubConnection } from '../store/slices/integrations-slice';
import gcpIcon from 'devicon/icons/googlecloud/googlecloud-original.svg';
import awsIcon from 'devicon/icons/amazonwebservices/amazonwebservices-original-wordmark.svg';
import azureIcon from 'devicon/icons/azure/azure-original.svg';
import { cn } from '../shared/utils/cn';
import logoDark from '../assets/logo-dark.png';
import logoLight from '../assets/logo-light.png';
import type { RootState, AppDispatch } from '../store';

// ── Auth ────────────────────────────────────────────────────────────────────

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

// ── App Bar ─────────────────────────────────────────────────────────────────

const AppBar: React.FC = () => {
  const { isDark, toggle, fontSize, increaseFontSize, decreaseFontSize } = useTheme();
  const dispatch = useDispatch<AppDispatch>();
  const deployIsOpen = useSelector((s: RootState) => s.deploy.isOpen);
  const deployStatus = useSelector((s: RootState) => s.deploy.status);
  const githubStatus = useSelector((s: RootState) => s.integrations.integrations.github?.status);
  const gcpStatus = useSelector((s: RootState) => s.integrations.integrations.gcp?.status);
  const [showGitHub, setShowGitHub] = useState(false);
  const [showGcp, setShowGcp] = useState(false);
  const [showAws, setShowAws] = useState(false);
  const [showAzure, setShowAzure] = useState(false);

  const canUndo = useSelector(selectCanUndo);
  const canRedo = useSelector(selectCanRedo);

  useEffect(() => { dispatch(checkGitHubConnection()); }, [dispatch]);

  return (
    <>
      <header className="h-11 flex items-center gap-2 px-3 border-b border-ice-border bg-ice-surface relative z-[9999] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={isDark ? logoDark : logoLight} alt="ICE" width={60} height={18} className="h-[18px] object-contain shrink-0" />
          <div className="w-px h-4 bg-ice-border shrink-0" />
          <Breadcrumbs />
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-0.5">
          <BarBtn id="ice-appbar-btn-organize" icon={LayoutGrid} onClick={() => dispatch(autoOrganizeCard())} tip="Auto-organize" />
          <BarBtn id="ice-appbar-btn-undo" icon={Undo2} onClick={() => dispatch(undoCardChange())} tip="Undo (Ctrl+Z)" disabled={!canUndo} />
          <BarBtn id="ice-appbar-btn-redo" icon={Redo2} onClick={() => dispatch(redoCardChange())} tip="Redo (Ctrl+Shift+Z)" disabled={!canRedo} />
          <BarSep />
          <BarBtn id="ice-appbar-btn-deploy" icon={Rocket} onClick={() => dispatch(openDeployPanel())} tip="Deploy"
            className={cn('text-emerald-500 hover:text-emerald-400', deployStatus === 'deploying' && 'animate-pulse')} />
          <BarSep />
          <BarImgBtn id="ice-appbar-btn-gcp" src={gcpIcon} onClick={() => setShowGcp(true)} tip="Google Cloud" connected={gcpStatus === 'connected'} />
          <BarImgBtn id="ice-appbar-btn-aws" src={awsIcon} onClick={() => setShowAws(true)} tip="AWS" />
          <BarImgBtn id="ice-appbar-btn-azure" src={azureIcon} onClick={() => setShowAzure(true)} tip="Azure" />
          <BarBtn id="ice-appbar-btn-github" icon={Github} onClick={() => setShowGitHub(true)} tip="GitHub"
            className={githubStatus === 'connected' ? 'text-emerald-500' : undefined} />
          <BarSep />
          <BarBtn icon={isDark ? Sun : Moon} onClick={toggle} tip={isDark ? 'Light mode' : 'Dark mode'} />
          <button
            onClick={decreaseFontSize}
            disabled={fontSize === 'small'}
            title="Decrease font size"
            className={cn('px-1 py-0.5 rounded text-ice-xs font-bold transition-[color,background-color,opacity]', fontSize === 'small' ? 'text-ice-text-3 opacity-40' : 'text-ice-text-3 hover:text-ice-text-1 hover:bg-ice-hover')}
          >
            A-
          </button>
          <button
            onClick={increaseFontSize}
            disabled={fontSize === 'large'}
            title="Increase font size"
            className={cn('px-1 py-0.5 rounded text-ice-base font-bold transition-[color,background-color,opacity]', fontSize === 'large' ? 'text-ice-text-3 opacity-40' : 'text-ice-text-3 hover:text-ice-text-1 hover:bg-ice-hover')}
          >
            A+
          </button>
          <BarSep />
          <ProfileAvatar />
        </div>
      </header>

      {/* Integration modals */}
      <GitHubConnectModal isOpen={showGitHub} onClose={() => setShowGitHub(false)} />
      <ProviderConnectModal isOpen={showGcp} onClose={() => setShowGcp(false)}
        providerId="gcp" providerName="Google Cloud Platform" providerIcon={gcpIcon}
        description="Connect your GCP project using a service account key. ICE deploys to your cloud — not ours."
        fields={[{ name: 'service_account_key', label: 'Service Account Key (JSON)', type: 'textarea',
          placeholder: '{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}', required: true,
          helpLink: { url: 'https://console.cloud.google.com/iam-admin/serviceaccounts', text: 'Create service account' } }]} />
      <ProviderConnectModal isOpen={showAws} onClose={() => setShowAws(false)}
        providerId="aws" providerName="Amazon Web Services" providerIcon={awsIcon}
        description="Connect your AWS account using access keys."
        fields={[
          { name: 'accessKeyId', label: 'Access Key ID', type: 'text', placeholder: 'AKIA...', required: true },
          { name: 'secretAccessKey', label: 'Secret Access Key', type: 'password', placeholder: '********', required: true },
          { name: 'region', label: 'Default Region', type: 'text', placeholder: 'us-east-1', required: true },
        ]} />
      <ProviderConnectModal isOpen={showAzure} onClose={() => setShowAzure(false)}
        providerId="azure" providerName="Microsoft Azure" providerIcon={azureIcon}
        description="Connect your Azure subscription using a service principal."
        fields={[
          { name: 'subscriptionId', label: 'Subscription ID', type: 'text', placeholder: 'xxxxxxxx-xxxx-...', required: true },
          { name: 'tenantId', label: 'Tenant ID', type: 'text', placeholder: 'xxxxxxxx-xxxx-...', required: true },
          { name: 'clientId', label: 'Client ID', type: 'text', placeholder: 'xxxxxxxx-xxxx-...', required: true },
          { name: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: '********', required: true },
        ]} />

      <DeployPanel isOpen={deployIsOpen} />
      <PromoteModal />
    </>
  );
};

const BarBtn: React.FC<{ id?: string; icon: React.ElementType; onClick: () => void; tip?: string; className?: string; disabled?: boolean }> = ({ id, icon: I, onClick, tip, className, disabled }) => (
  <button id={id} onClick={onClick} aria-label={tip} title={tip} disabled={disabled} className={cn('p-1.5 rounded text-ice-text-3 hover:text-ice-text-1 hover:bg-ice-hover transition-[color,background-color]', disabled && 'opacity-30 pointer-events-none', className)}>
    <I className="w-4 h-4" aria-hidden="true" />
  </button>
);
const BarImgBtn: React.FC<{ id?: string; src: string; onClick: () => void; tip?: string; connected?: boolean }> = ({ id, src, onClick, tip, connected }) => (
  <button id={id} onClick={onClick} aria-label={tip} title={tip} className={cn('relative p-1.5 rounded hover:bg-ice-hover transition-[background-color]', connected && 'ring-1 ring-emerald-500/40 rounded-md')}>
    <img src={src} alt={tip || ''} width={16} height={16} className="w-4 h-4" />
    {connected && <div aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-ice-raised" />}
  </button>
);
const BarSep: React.FC = () => <div className="w-px h-4 bg-ice-border mx-1" />;

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
                isActive
                  ? 'bg-ice-active text-ice-text-1'
                  : 'text-ice-text-3 hover:text-ice-text-2 hover:bg-ice-hover'
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
              : 'text-ice-text-3 hover:text-ice-text-2'
          )}
        >
          <PenTool className="w-3 h-3" />
          Canvas
        </button>
        <button
          onClick={() => navigate(`${basePath}/table`)}
          className={cn(
            'flex items-center gap-1 px-2 py-1 text-ice-sm font-medium rounded transition-colors',
            activeTab === 'table'
              ? 'bg-ice-active text-ice-text-1 shadow-sm'
              : 'text-ice-text-3 hover:text-ice-text-2'
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
  const projectBasePath = resolved.type === 'project'
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
  const folderBasePath = resolved.breadcrumbs.length > 0
    ? resolved.breadcrumbs[resolved.breadcrumbs.length - 1].path
    : resolved.orgPrefix;

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
  const dispatch = useDispatch<AppDispatch>();
  useEffect(() => { dispatch(fetchProfile()); }, [dispatch]);

  return (
    <div className="h-full flex flex-col bg-ice-surface">
      <AppBar />
      <div className="flex-1 overflow-y-auto p-8">{children}</div>
    </div>
  );
};

// ── Root ─────────────────────────────────────────────────────────────────────

const App: React.FC = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
      <Route path="/invite/:token" element={<InviteAcceptPage />} />
      <Route path="/settings" element={<ProtectedRoute><PageLayout><UserSettingsPage /></PageLayout></ProtectedRoute>} />
      <Route path="/team" element={<ProtectedRoute><PageLayout><TeamPage /></PageLayout></ProtectedRoute>} />
      <Route path="/*" element={<ProtectedRoute><DynamicContent /></ProtectedRoute>} />
    </Routes>
  </BrowserRouter>
);

export default App;
