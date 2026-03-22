/**
 * Renderer Messages — All user-facing strings for the desktop renderer
 *
 * Deploy panel, toolbar, status bar, palette, providers, and empty canvas strings.
 */

// =============================================================================
// Deploy Panel
// =============================================================================

export const DEPLOY_UI = {
  TITLE: 'Infrastructure Deploy',

  // Buttons
  PLAN_BUTTON: 'Plan',
  DEPLOY_BUTTON: 'Deploy',
  RESET_BUTTON: 'Reset',

  // Status badges
  STATUS_AUTHENTICATING: 'Authenticating',
  STATUS_PLANNING: 'Planning',
  STATUS_PLANNED: 'Plan Ready',
  STATUS_DEPLOYING: 'Deploying',
  STATUS_SUCCESS: 'Deployed',
  STATUS_ERROR: 'Error',
  STATUS_CANCELLED: 'Cancelled',

  // Config section
  GCP_PROJECT_LABEL: 'GCP Project',
  GCP_PROJECT_PLACEHOLDER: 'my-gcp-project',
  REGION_LABEL: 'Region',
  ENVIRONMENT_LABEL: 'Environment',
  ENV_DEVELOPMENT: 'Development',
  ENV_STAGING: 'Staging',
  ENV_PRODUCTION: 'Production',

  // Card info
  CARD_LABEL: 'Card:',
  UNTITLED: 'Untitled',
  DEPLOYABLE_RESOURCE: 'deployable resource',
  SKIPPED_NON_GCP: 'skipped \u2014 non-GCP',
  DEPLOYED_RESOURCE: 'deployed resource',

  // Auth prompts
  CONNECTING_TO_GCP: 'Connecting to GCP...',
  AUTH_BROWSER_PROMPT: 'A browser window will open for Google authentication. Complete the sign-in to continue.',

  // Plan display
  NO_CHANGES: 'No changes detected. Infrastructure is up to date.',
  PLAN_CHANGES: (total: number) => `Plan: ${total} change${total !== 1 ? 's' : ''}`,
  SKIP_ACTION: 'skip',

  // Progress
  DEPLOYING: 'Deploying...',
  PROGRESS_PERCENT: (pct: number) => `${pct}%`,
  RESULTS_SUCCEEDED: (n: number) => `${n} succeeded`,
  RESULTS_FAILED: (n: number) => `${n} failed`,

  // Error banners
  API_NOT_ENABLED_TITLE: 'Required GCP APIs are not enabled',
  API_NOT_ENABLED_HINT:
    'Some Google Cloud APIs need to be enabled before deployment. Click the button below to open the GCP Console, enable the API, then click Retry.',
  ENABLE_API: (api: string) => `Enable ${api}`,
  OPENS_CONSOLE: 'Opens GCP Console',
  RETRY_DEPLOY: 'Retry Deploy',
  ENABLE_IN_CONSOLE: 'Enable API in GCP Console',

  // Copy
  COPY: 'copy',
  COPY_PROVIDER_ID: 'Copy provider ID',
} as const;

// =============================================================================
// API Error Detection (browser-safe copies of core detection functions)
// =============================================================================

const API_NOT_ENABLED_PATTERNS = [
  'has not been used in project',
  'it is disabled',
  'API has not been enabled',
  'PERMISSION_DENIED',
  'SERVICE_DISABLED',
  'accessNotConfigured',
  'must be enabled',
];

export function isApiNotEnabledError(error: string): boolean {
  return API_NOT_ENABLED_PATTERNS.some((p) => error.includes(p));
}

export function extractApiName(errorOrUrl: string): string | null {
  const urlMatch = errorOrUrl.match(/api\/([a-z0-9.-]+\.googleapis\.com)/);
  if (urlMatch) return urlMatch[1]!;
  const patterns = [
    /API \[([a-z0-9.-]+\.googleapis\.com)\]/,
    /service\s+"([a-z0-9.-]+\.googleapis\.com)"/,
    /([a-z0-9]+\.googleapis\.com)\s+/,
  ];
  for (const re of patterns) {
    const m = errorOrUrl.match(re);
    if (m) return m[1]!;
  }
  return null;
}

export function extractApiEnableUrl(error: string): string | null {
  const urlPattern = /https:\/\/console\.cloud\.google\.com\/apis\/[^\s"')]+/;
  const m = error.match(urlPattern);
  if (m) return m[0]!;
  const apiName = extractApiName(error);
  if (apiName) return buildApiEnableUrl(apiName);
  return null;
}

export function buildApiEnableUrl(apiName: string, project?: string): string {
  const base = `https://console.cloud.google.com/apis/api/${apiName}/overview`;
  return project ? `${base}?project=${project}` : base;
}

// =============================================================================
// Toolbar
// =============================================================================

export const TOOLBAR = {
  NEW_GRAPH: 'New Graph (Ctrl+N)',
  OPEN: 'Open (Ctrl+O)',
  SAVE: 'Save (Ctrl+S)',
  LOAD_DEMO: 'Load Demo Infrastructure',
  NEW_PROJECT: 'New Project',
  UNDO: 'Undo (Ctrl+Z)',
  REDO: 'Redo (Ctrl+Y)',
  AUTO_ORGANIZE: 'Auto-Organize Layout (Ctrl+Shift+O)',
  TOGGLE_PALETTE: 'Toggle Palette (Ctrl+P)',
  TOGGLE_PROPERTIES: 'Toggle Properties (Ctrl+I)',
  TOGGLE_MINIMAP: 'Toggle Minimap (Ctrl+M)',
  SPLIT_RIGHT: 'Split Right (side-by-side)',
  SPLIT_DOWN: 'Split Down (top-bottom)',
  CLOSE_SPLIT: 'Close Split',
  DEPLOY: 'Deploy Infrastructure (Ctrl+Shift+D)',
  CLOUD_PROVIDERS: 'Cloud Providers - Import from AWS/GCP/Azure',
  SWITCH_LIGHT: 'Switch to Light Mode',
  SWITCH_DARK: 'Switch to Dark Mode',
  LOADING: 'Loading...',
  MODIFIED: '(modified)',
} as const;

// =============================================================================
// Status Bar
// =============================================================================

export const STATUS_BAR = {
  UNTITLED: 'untitled',
  VALID: 'Valid',
  VERSION: 'ICE v0.1.0',

  // Deploy status
  CONNECTING: 'Connecting to GCP...',
  DEPLOYING: (pct: number) => `Deploying ${pct}%`,
  PLANNING: 'Planning...',
  DEPLOYED: 'Deployed',
  DEPLOY_FAILED: 'Deploy failed',
  PLAN_READY: 'Plan ready',
} as const;

// =============================================================================
// Empty Canvas Overlay
// =============================================================================

export const EMPTY_CANVAS = {
  TITLE: 'What are you building?',
  SUBTITLE: 'Pick a starting point \u2014 you can always change it later',
  BLANK_CANVAS: 'Blank Canvas',
  PICK_TEMPLATE: 'Pick a template...',
} as const;

// =============================================================================
// Deploy Slice (Redux reducer log strings)
// =============================================================================

export const DEPLOY_SLICE_MESSAGES = {
  CONNECTING: 'Connecting to GCP...',
  AUTH_SUCCESS: 'GCP authentication successful.',
  AUTH_FAILED: (error: string) => `Authentication failed: ${error}`,
  PLANNING: 'Planning deployment...',
  PLAN_READY: (creates: number, updates: number, deletes: number) =>
    `Plan ready: ${creates} create, ${updates} update, ${deletes} delete`,
  DEPLOYING: 'Deploying...',
  DEPLOY_COMPLETED: (seconds: string) => `Deploy completed in ${seconds}s`,
  ERROR: (error: string) => `Error: ${error}`,
} as const;

// =============================================================================
// Integrations
// =============================================================================

export const INTEGRATIONS = {
  DROPDOWN_TITLE: 'Integrations',
  CONNECTED: 'Connected',
  DISCONNECTED: 'Not connected',
  CONNECTING: 'Connecting...',
  ERROR: 'Error',
  DISCONNECT: 'Disconnect',
  CONNECT: 'Connect',
} as const;

export const GITHUB = {
  TITLE: 'GitHub',
  CONNECT_TITLE: 'Connect to GitHub',
  CONNECTED_AS: (username: string) => `Connected as ${username}`,

  // PAT tab
  PAT_TAB: 'Personal Access Token',
  PAT_LABEL: 'GitHub Token',
  PAT_PLACEHOLDER: 'ghp_xxxxxxxxxxxxxxxxxxxx',
  PAT_HELP: 'Generate a token at github.com/settings/tokens with repo scope.',
  PAT_CONNECT: 'Connect with Token',

  // Device Flow tab
  DEVICE_FLOW_TAB: 'Sign in with Browser',
  DEVICE_FLOW_BUTTON: 'Sign in with GitHub',
  DEVICE_FLOW_INSTRUCTIONS: 'A browser window will open. Enter this code to authorize:',
  DEVICE_FLOW_WAITING: 'Waiting for authorization...',
  DEVICE_FLOW_COPY: 'Copy Code',
  DEVICE_FLOW_COPIED: 'Copied!',

  // Repos
  REPOS_TITLE: 'Repositories',
  NO_REPOS: 'No repositories found',
  LOADING_REPOS: 'Loading repositories...',
  BRANCHES: 'branches',
  PRIVATE: 'private',
} as const;

// =============================================================================
// Repo Selector (inline + PropertiesPanel)
// =============================================================================

export const REPO_SELECTOR = {
  PLACEHOLDER: 'Search repositories...',
  NO_REPOS: 'No repositories found',
  LOADING: 'Loading repos...',
  NOT_CONNECTED: 'Connect GitHub to link repos',
  LINK_REPO: 'Link repo',
  CLEAR: 'Unlink',
} as const;

// =============================================================================
// Pipeline (CI/CD)
// =============================================================================

export const PIPELINE = {
  TITLE: 'Pipeline',
  PANEL_TITLE: (name: string) => `Pipeline: ${name}`,

  // Sections
  SOURCE: 'Source',
  TRIGGERS: 'Triggers',
  BUILD: 'Build',
  DEPLOYMENTS: 'Deployments',

  // Source
  CHANGE_REPO: 'Change',
  DETECTED: (framework: string) => `Detected: ${framework}`,
  DETECTING: 'Detecting framework...',
  NO_REPO: 'No repository linked',

  // Triggers
  ENABLED: 'Enabled',
  DISABLED: 'Disabled',
  PUSH_TO: 'Push to',
  MERGE_TO: 'Merge to',
  ADD_TRIGGER: '+ Add trigger',
  NO_TRIGGERS: 'No triggers configured',

  // Build
  INSTALL_COMMAND: 'Install',
  BUILD_COMMAND: 'Build',
  OUTPUT_DIR: 'Output',
  AUTO_DETECTED: '(auto-detected)',

  // Deployment status
  STATUS_IDLE: 'Idle',
  STATUS_QUEUED: 'Queued',
  STATUS_BUILDING: 'Building',
  STATUS_DEPLOYING: 'Deploying',
  STATUS_SUCCESS: 'Live',
  STATUS_FAILED: 'Failed',

  // Deployment history
  NO_DEPLOYMENTS: 'No deployments yet',
  VIEW_LOGS: 'Logs',
  DURATION: (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  },
  AGO: (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  },

  // Actions
  DEPLOY_NOW: 'Deploy Now',
  ENABLE_PIPELINE: 'Enable Pipeline',
  RETRY: 'Retry',

  // Log steps
  STEP_PREPARE: 'Preparing',
  STEP_CLONE: 'Cloning repository',
  STEP_INSTALL: 'Installing dependencies',
  STEP_BUILD: 'Building application',
  STEP_DEPLOY: 'Deploying',
  STEP_CONFIGURE: 'Configuring',
} as const;

// =============================================================================
// Onboarding
// =============================================================================

export const ONBOARDING = {
  SKIP_SETUP: 'Skip setup',
  BACK: 'Back',
  SKIP: 'Skip',
  CONTINUE: 'Continue',
  CREATE_AND_START: 'Create & Start',

  // Step labels
  STEP_WELCOME: 'Welcome',
  STEP_TEAM: 'Team',
  STEP_CLOUD: 'Cloud',
  STEP_GITHUB: 'GitHub',
  STEP_PROJECT: 'Project',

  // Welcome step
  WELCOME_TITLE: (name?: string) => (name ? `Welcome to ICE, ${name}` : 'Welcome to ICE'),
  WELCOME_SUBTITLE: 'Design, deploy, and manage cloud infrastructure visually',
  PROVIDER_LABEL: 'Which cloud do you primarily use?',
  REGION_LABEL: 'Default region',
  REGION_HINT: 'Auto-selected based on your location. You can change this per project.',

  // Team step
  TEAM_TITLE: 'How do you want to work?',
  TEAM_SUBTITLE: 'You can always change this later in Settings',
  TEAM_CREATE: 'Create a team',
  TEAM_JOIN: 'Join a team',
  TEAM_SOLO: 'Work solo',
  TEAM_NAME_LABEL: 'Team name',
  INVITE_LABEL: 'Invite teammates (optional)',

  // Cloud step
  CLOUD_TITLE: (provider: string) => `Connect ${provider}`,
  CLOUD_SUBTITLE: 'ICE deploys to your cloud account — we never store your data',
  CLOUD_CONNECTED: 'Connected',
  CLOUD_TEST_CONNECT: 'Test & Connect',
  CLOUD_SECURITY_NOTE: 'Your credentials are encrypted at rest and used only to manage your infrastructure.',

  // GitHub step
  GITHUB_TITLE: 'Connect GitHub',
  GITHUB_SUBTITLE: 'Link repositories to services on the canvas for CI/CD',
  GITHUB_REPO_HINT: 'You can link repositories to services on the canvas later.',

  // Project step
  PROJECT_TITLE: 'What are you building?',
  PROJECT_SUBTITLE: 'Pick a starting point — you can always change it later',
  PROJECT_NAME_LABEL: 'Project name',
  BLANK_CANVAS: 'Blank Canvas',
  BLANK_CANVAS_DESC: 'Start from scratch with an empty project',

  // Checklist
  CHECKLIST_TITLE: 'Setup checklist',
  CHECKLIST_ACCOUNT: 'Create account',
  CHECKLIST_PROVIDER: 'Choose cloud provider',
  CHECKLIST_CLOUD: 'Connect cloud credentials',
  CHECKLIST_GITHUB: 'Connect GitHub',
} as const;
