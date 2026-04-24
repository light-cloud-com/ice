/**
 * ICE API Adapter Interface
 *
 * Mirrors the window.api shape from the Electron preload script.
 * Web implementation uses HTTP calls to the platform backend.
 * Desktop implementation wraps Electron IPC (unchanged).
 */

export interface IceAPI {
  graph: {
    create: (name?: string) => Promise<any>;
    load: (filePath: string) => Promise<any>;
    save: (filePath?: string) => Promise<any>;
    get: () => Promise<any>;
    addNode: (input: any) => Promise<any>;
    updateNode: (id: string, updates: any) => Promise<any>;
    removeNode: (id: string) => Promise<any>;
    addEdge: (input: any) => Promise<any>;
    removeEdge: (id: string) => Promise<any>;
    validate: () => Promise<any>;
  };

  schema: {
    getCategories: () => Promise<any>;
    query: (query: { category?: string; search?: string; provider?: string }) => Promise<any>;
    get: (iceType: string) => Promise<any>;
  };

  resources: {
    getCategories: () => Promise<any>;
    getAll: () => Promise<any>;
    getByCategory: (categoryId: string) => Promise<any>;
    search: (query: string) => Promise<any>;
    getLowLevel: (highLevelId: string) => Promise<any>;
  };

  dialog: {
    openFile: () => Promise<string | null>;
    saveFile: () => Promise<string | null>;
    importTerraform: () => Promise<any>;
    selectDirectory: () => Promise<string | null>;
  };

  projects: {
    scanDirectory: (dirPath: string) => Promise<any>;
    createFolder: (parentPath: string, folderName: string) => Promise<any>;
  };

  provider: {
    getCredentials: (providerId: string) => Promise<any>;
    saveCredentials: (providerId: string, credentials: Record<string, string>) => Promise<any>;
    isConnected: (providerId: string) => Promise<boolean>;
    connect: (providerId: string, credentials: Record<string, string>) => Promise<any>;
    disconnect: (providerId: string) => Promise<void>;
    getProjects: (providerId: string) => Promise<any[]>;
    import: (providerId: string, projectId: string) => Promise<any>;
    exchangeGCPCode: (code: string) => Promise<any>;
    connectGCPOAuth: (accessToken: string, expiresIn: number) => Promise<any>;
  };

  templates: {
    loadToGraph: (data: { name: string; nodes: any[]; edges: any[] }) => Promise<any>;
  };

  github: {
    isConnected: () => Promise<boolean>;
    getUser: () => Promise<any>;
    connectPAT: (token: string) => Promise<any>;
    startDeviceFlow: () => Promise<any>;
    pollDeviceFlow: (deviceCode: string, interval: number) => Promise<any>;
    disconnect: () => Promise<void>;
    listRepos: (page?: number) => Promise<any>;
    listBranches: (owner: string, repo: string) => Promise<any>;
  };

  deploy: {
    plan: (cardId: string, nodes: any[], edges: any[], options: any) => Promise<any>;
    apply: (cardId: string, nodes: any[], edges: any[], options: any) => Promise<any>;
    destroy: (cardId: string, options: any) => Promise<any>;
    /** Destroy every ICE-managed resource ever deployed for this card. */
    destroyAll: (cardId: string, options?: { gcpProject?: string }) => Promise<any>;
    getStatus: (deploymentId: string) => Promise<any>;
    authenticate: () => Promise<any>;
    getResources: (cardId: string) => Promise<any>;
    getDeployments: (cardId: string) => Promise<any>;
    requirements: (cardId: string, nodes: any[], options: any) => Promise<any>;
    /** In-flight deploy snapshot — used for cross-tab hydration. */
    getCurrentDeploy: (cardId: string) => Promise<any>;
    /** Replay tape for a deploy — events with seq > `since`. Used to hydrate logs + progress on page reload. */
    getDeployStream: (cardId: string, since?: number, deploymentId?: string) => Promise<any>;
    /** Per-node deploy overlay — used on card mount. */
    getNodeOutputs: (cardId: string, environment?: string) => Promise<any>;
    /** Scan + delete orphaned ICE resources in the GCP project. */
    cleanupOrphans: (args?: { gcpProject?: string; dryRun?: boolean }) => Promise<any>;
    openExternal: (url: string) => void;
  };

  pipeline: {
    getRules: (cardId: string, nodeId: string) => Promise<any>;
    createRule: (input: any) => Promise<any>;
    updateRule: (ruleId: string, updates: any) => Promise<any>;
    deleteRule: (ruleId: string) => Promise<any>;
    getEvents: (cardId: string, nodeId: string) => Promise<any>;
    detectFramework: (repository: string, branch?: string) => Promise<any>;
    triggerDeploy: (ruleId: string, branch?: string) => Promise<any>;
    retryDeploy: (eventId: string) => Promise<any>;
    cancelDeploy: (eventId: string) => Promise<any>;
  };

  environments: {
    list: (projectId: string) => Promise<any>;
    create: (input: { projectId: string; name: string; type: string; region?: string }) => Promise<any>;
    update: (envId: string, data: { name?: string; region?: string }) => Promise<any>;
    delete: (envId: string) => Promise<any>;
    compare: (sourceEnvId: string, targetEnvId: string) => Promise<any>;
    promote: (sourceEnvId: string, targetEnvId: string) => Promise<any>;
    togglePrPreviews: (projectId: string, enabled: boolean) => Promise<any>;
  };

  onMenuAction: (callback: (action: string) => void) => () => void;
  onDeployProgress: (callback: (event: any) => void) => () => void;
  onPipelineUpdate: (callback: (event: any) => void) => () => void;
  onCardPipelineUpdate: (callback: (event: any) => void) => () => void;
  subscribeDeployProgress?: (cardId: string) => () => void;
  subscribePipeline?: (nodeId: string) => () => void;
  subscribeCardPipeline?: (cardId: string) => () => void;
}

// Global API instance — set during app initialization
let _api: IceAPI;

export function setApiAdapter(api: IceAPI): void {
  _api = api;
}

export function getApi(): IceAPI {
  if (!_api) {
    throw new Error('API adapter not initialized. Call setApiAdapter() first.');
  }
  return _api;
}
