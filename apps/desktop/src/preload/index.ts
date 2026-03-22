/**
 * Preload Script
 *
 * Exposes safe APIs to the renderer process via contextBridge.
 * This is the only bridge between Node.js and the browser context.
 */

import { contextBridge, ipcRenderer } from 'electron';

/**
 * Type-safe API exposed to renderer
 */
const api = {
  // =========================================
  // Graph Operations
  // =========================================

  graph: {
    create: (name?: string) => ipcRenderer.invoke('graph:create', name),
    load: (file_path: string) => ipcRenderer.invoke('graph:load', file_path),
    save: (file_path?: string) => ipcRenderer.invoke('graph:save', file_path),
    get: () => ipcRenderer.invoke('graph:get'),

    addNode: (input: any) => ipcRenderer.invoke('graph:addNode', input),
    updateNode: (id: string, updates: any) => ipcRenderer.invoke('graph:updateNode', id, updates),
    removeNode: (id: string) => ipcRenderer.invoke('graph:removeNode', id),

    addEdge: (input: any) => ipcRenderer.invoke('graph:addEdge', input),
    removeEdge: (id: string) => ipcRenderer.invoke('graph:removeEdge', id),

    validate: () => ipcRenderer.invoke('graph:validate'),
  },

  // =========================================
  // Schema Operations
  // =========================================

  schema: {
    getCategories: () => ipcRenderer.invoke('schema:getCategories'),
    query: (query: { category?: string; search?: string; provider?: string }) =>
      ipcRenderer.invoke('schema:query', query),
    get: (ice_type: string) => ipcRenderer.invoke('schema:get', ice_type),
  },

  // =========================================
  // High-Level Resources (User-friendly abstractions)
  // =========================================

  resources: {
    getCategories: () => ipcRenderer.invoke('resources:getCategories'),
    getAll: () => ipcRenderer.invoke('resources:getAll'),
    getByCategory: (categoryId: string) =>
      ipcRenderer.invoke('resources:getByCategory', categoryId),
    search: (query: string) => ipcRenderer.invoke('resources:search', query),
    getLowLevel: (highLevelId: string) => ipcRenderer.invoke('resources:getLowLevel', highLevelId),
  },

  // =========================================
  // File Dialogs
  // =========================================

  dialog: {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    saveFile: () => ipcRenderer.invoke('dialog:saveFile'),
    importTerraform: () => ipcRenderer.invoke('dialog:importTerraform'),
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  },

  // =========================================
  // Project List Operations
  // =========================================

  projects: {
    scanDirectory: (dirPath: string) => ipcRenderer.invoke('projects:scanDirectory', dirPath),
    createFolder: (parentPath: string, folderName: string) =>
      ipcRenderer.invoke('projects:createFolder', parentPath, folderName),
  },

  // =========================================
  // Window State
  // =========================================

  window: {
    getFilePath: () => ipcRenderer.invoke('window:getFilePath'),
    isDirty: () => ipcRenderer.invoke('window:isDirty'),
  },

  // =========================================
  // Provider Operations
  // =========================================

  provider: {
    getCredentials: (providerId: string) =>
      ipcRenderer.invoke('provider:getCredentials', providerId),
    saveCredentials: (providerId: string, credentials: Record<string, string>) =>
      ipcRenderer.invoke('provider:saveCredentials', providerId, credentials),
    isConnected: (providerId: string) => ipcRenderer.invoke('provider:isConnected', providerId),
    connect: (providerId: string, credentials: Record<string, string>) =>
      ipcRenderer.invoke('provider:connect', providerId, credentials),
    disconnect: (providerId: string) => ipcRenderer.invoke('provider:disconnect', providerId),
    getProjects: (providerId: string) => ipcRenderer.invoke('provider:getProjects', providerId),
    import: (providerId: string, projectId: string) =>
      ipcRenderer.invoke('provider:import', providerId, projectId),
  },

  // =========================================
  // Template Operations
  // =========================================

  templates: {
    loadToGraph: (data: { name: string; nodes: any[]; edges: any[] }) =>
      ipcRenderer.invoke('templates:loadToGraph', data),
  },

  // =========================================
  // Menu Event Listeners
  // =========================================

  onMenuAction: (callback: (action: string) => void) => {
    const menu_actions = [
      'menu:newGraph',
      'menu:openGraph',
      'menu:saveGraph',
      'menu:saveGraphAs',
      'menu:importTerraform',
      'menu:importPulumi',
      'menu:importAws',
      'menu:importGcp',
      'menu:importAzure',
      'menu:exportJson',
      'menu:exportYaml',
      'menu:exportTerraform',
      'menu:exportPulumi',
      'menu:undo',
      'menu:redo',
      'menu:selectAll',
      'menu:deselectAll',
      'menu:deleteSelected',
      'menu:zoomIn',
      'menu:zoomOut',
      'menu:fitToScreen',
      'menu:toggleMinimap',
      'menu:togglePalette',
      'menu:toggleProperties',
      'menu:autoLayout',
      'menu:validate',
      'menu:groupSelected',
      'menu:ungroupSelected',
      'menu:showLayers',
      'menu:showCriticalPath',
      'menu:plan',
      'menu:apply',
      'menu:diff',
      'menu:destroy',
    ];

    menu_actions.forEach((action) => {
      ipcRenderer.on(action, () => callback(action));
    });

    // Return cleanup function
    return () => {
      menu_actions.forEach((action) => {
        ipcRenderer.removeAllListeners(action);
      });
    };
  },

  // =========================================
  // GitHub Operations
  // =========================================

  github: {
    isConnected: () => ipcRenderer.invoke('github:isConnected'),
    getUser: () => ipcRenderer.invoke('github:getUser'),
    connectPAT: (token: string) => ipcRenderer.invoke('github:connectPAT', token),
    startDeviceFlow: () => ipcRenderer.invoke('github:startDeviceFlow'),
    pollDeviceFlow: (deviceCode: string, interval: number) =>
      ipcRenderer.invoke('github:pollDeviceFlow', deviceCode, interval),
    disconnect: () => ipcRenderer.invoke('github:disconnect'),
    listRepos: (page?: number) => ipcRenderer.invoke('github:listRepos', page),
    listBranches: (owner: string, repo: string) =>
      ipcRenderer.invoke('github:listBranches', owner, repo),
  },

  // =========================================
  // Deploy Operations
  // =========================================

  deploy: {
    plan: (cardId: string, nodes: any[], edges: any[], options: any) =>
      ipcRenderer.invoke('deploy:plan', cardId, nodes, edges, options),
    apply: (cardId: string, nodes: any[], edges: any[], options: any) =>
      ipcRenderer.invoke('deploy:apply', cardId, nodes, edges, options),
    destroy: (cardId: string, options: any) =>
      ipcRenderer.invoke('deploy:destroy', cardId, options),
    getStatus: (deploymentId: string) => ipcRenderer.invoke('deploy:getStatus', deploymentId),
    authenticate: () => ipcRenderer.invoke('deploy:authenticate'),
    getResources: (cardId: string) => ipcRenderer.invoke('deploy:getResources', cardId),
    getDeployments: (cardId: string) => ipcRenderer.invoke('deploy:getDeployments', cardId),
    openExternal: (url: string) => ipcRenderer.invoke('deploy:openExternal', url),
  },

  // =========================================
  // Deploy Events
  // =========================================

  onDeployProgress: (callback: (event: any) => void) => {
    ipcRenderer.on('deploy:progress', (_event, data) => callback(data));
    return () => {
      ipcRenderer.removeAllListeners('deploy:progress');
    };
  },
};

// Expose API to renderer
contextBridge.exposeInMainWorld('api', api);

// Type declaration for renderer
export type IceDesktopAPI = typeof api;
