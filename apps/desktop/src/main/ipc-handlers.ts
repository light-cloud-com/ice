/**
 * IPC Handlers - Bridge between main and renderer processes
 *
 * Handles all IPC communication for graph operations, schema queries,
 * file operations, and deployment commands.
 */

import { exec } from 'child_process';
import { randomUUID } from 'crypto';
import { readFile, writeFile, readdir, stat, mkdir } from 'fs/promises';
import { join, basename, extname } from 'path';
import { promisify } from 'util';
import {
  HIGH_LEVEL_CATEGORIES,
  getHighLevelResourcesForPalette,
  import_gcp_to_graph,
  import_aws_to_graph,
  import_azure_to_graph,
  type AWSImportOptions,
  type AzureImportOptions,
} from '@ice/core';
import { ipcMain, dialog, BrowserWindow } from 'electron';
import Store from 'electron-store';
import { GitHubService } from './github-service';

// Secure credential store
const credentialStore = new Store({
  name: 'provider-credentials',
  encryptionKey: process.env.ICE_CREDENTIAL_KEY || 'ice-dev-only-not-for-production',
});

// Provider credentials types (used for type safety in credential store)

interface ProviderProject {
  id: string;
  name: string;
  region?: string;
}

// Schema types
interface SchemaProperty {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  computed?: boolean;
  sensitive?: boolean;
  deprecated?: boolean;
  nested_properties?: SchemaProperty[];
}

interface SchemaImplementation {
  source: string;
  provider_name: string;
  resource_type: string;
  documentation_url?: string;
}

interface UnifiedSchema {
  ice_type: string;
  display_name: string;
  description: string;
  category: string;
  implementations: SchemaImplementation[];
  properties: SchemaProperty[];
}

// Schema cache
let schemas_cache: UnifiedSchema[] | null = null;
let categories_cache: string[] | null = null;

// Types for the graph (simplified for desktop UI)
interface IceNode {
  id: string;
  type: string;
  name: string;
  properties: Record<string, unknown>;
  metadata: {
    created_at: string;
    updated_at: string;
    labels: Record<string, string>;
  };
}

interface IceEdge {
  id: string;
  source: string;
  target: string;
  relationship: 'depends_on' | 'contains' | 'references' | 'connects_to';
  metadata: {
    created_at: string;
    labels: Record<string, string>;
  };
}

interface SerializedGraph {
  id: string;
  name: string;
  version: string;
  nodes: IceNode[];
  edges: IceEdge[];
  metadata: Record<string, unknown>;
}

interface NodeInput {
  type: string;
  name: string;
  properties?: Record<string, unknown>;
}

interface EdgeInput {
  source: string;
  target: string;
  relationship: string;
}

interface GraphValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string; severity: string; code: string }>;
  warnings: Array<{ path: string; message: string; severity: string; code: string }>;
  info: Array<{ path: string; message: string; severity: string; code: string }>;
}

// Simple in-memory graph implementation
class SimpleGraph {
  id: string;
  name: string;
  version: string;
  nodes: Map<string, IceNode> = new Map();
  edges: Map<string, IceEdge> = new Map();
  metadata: Record<string, unknown> = {};

  constructor(name: string, version: string) {
    this.id = randomUUID();
    this.name = name;
    this.version = version;
  }

  add_node(input: NodeInput): { node: IceNode } {
    const id = randomUUID();
    const now = new Date().toISOString();
    const node: IceNode = {
      id,
      type: input.type,
      name: input.name,
      properties: input.properties || {},
      metadata: {
        created_at: now,
        updated_at: now,
        labels: {},
      },
    };
    this.nodes.set(id, node);
    return { node };
  }

  update_node(id: string, updates: Partial<NodeInput>): { node: IceNode } {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Node ${id} not found`);

    if (updates.name) node.name = updates.name;
    if (updates.properties) node.properties = { ...node.properties, ...updates.properties };
    node.metadata.updated_at = new Date().toISOString();

    return { node };
  }

  remove_node(id: string): void {
    this.nodes.delete(id);
    // Remove associated edges
    for (const [edgeId, edge] of this.edges) {
      if (edge.source === id || edge.target === id) {
        this.edges.delete(edgeId);
      }
    }
  }

  add_edge(input: EdgeInput): { edge: IceEdge } {
    const id = randomUUID();
    const edge: IceEdge = {
      id,
      source: input.source,
      target: input.target,
      relationship: input.relationship as IceEdge['relationship'],
      metadata: {
        created_at: new Date().toISOString(),
        labels: {},
      },
    };
    this.edges.set(id, edge);
    return { edge };
  }

  remove_edge(id: string): void {
    this.edges.delete(id);
  }

  serialize(): SerializedGraph {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
      metadata: this.metadata,
    };
  }

  static deserialize(data: SerializedGraph): SimpleGraph {
    const graph = new SimpleGraph(data.name, data.version);
    graph.id = data.id;
    graph.metadata = data.metadata;
    for (const node of data.nodes) {
      graph.nodes.set(node.id, node);
    }
    for (const edge of data.edges) {
      graph.edges.set(edge.id, edge);
    }
    return graph;
  }
}

// Current graph state (held in main process)
let current_graph: SimpleGraph | null = null;
let current_file_path: string | null = null;

/**
 * Register all IPC handlers
 */
export function register_ipc_handlers(): void {
  // =========================================
  // Graph Operations
  // =========================================

  ipcMain.handle('graph:create', async (_event, name?: string) => {
    current_graph = new SimpleGraph(name || 'untitled', '1.0.0');
    current_file_path = null;
    return current_graph.serialize();
  });

  ipcMain.handle('graph:load', async (_event, file_path: string) => {
    const content = await readFile(file_path, 'utf-8');
    const data = JSON.parse(content) as SerializedGraph;
    current_graph = SimpleGraph.deserialize(data);
    current_file_path = file_path;
    return current_graph.serialize();
  });

  ipcMain.handle('graph:save', async (_event, file_path?: string) => {
    if (!current_graph) {
      throw new Error('No graph to save');
    }

    const save_path = file_path || current_file_path;
    if (!save_path) {
      throw new Error('No file path specified');
    }

    const serialized = current_graph.serialize();
    await writeFile(save_path, JSON.stringify(serialized, null, 2));
    current_file_path = save_path;

    return { success: true, path: save_path };
  });

  ipcMain.handle('graph:get', async () => {
    if (!current_graph) {
      return null;
    }
    return current_graph.serialize();
  });

  ipcMain.handle('graph:addNode', async (_event, input: NodeInput) => {
    if (!current_graph) {
      throw new Error('No graph loaded');
    }
    return current_graph.add_node(input);
  });

  ipcMain.handle('graph:updateNode', async (_event, id: string, updates: Partial<NodeInput>) => {
    if (!current_graph) {
      throw new Error('No graph loaded');
    }
    return current_graph.update_node(id as any, updates);
  });

  ipcMain.handle('graph:removeNode', async (_event, id: string) => {
    if (!current_graph) {
      throw new Error('No graph loaded');
    }
    return current_graph.remove_node(id as any);
  });

  ipcMain.handle('graph:addEdge', async (_event, input: EdgeInput) => {
    if (!current_graph) {
      throw new Error('No graph loaded');
    }
    return current_graph.add_edge(input);
  });

  ipcMain.handle('graph:removeEdge', async (_event, id: string) => {
    if (!current_graph) {
      throw new Error('No graph loaded');
    }
    return current_graph.remove_edge(id as any);
  });

  ipcMain.handle('graph:validate', async (): Promise<GraphValidationResult> => {
    if (!current_graph) {
      throw new Error('No graph loaded');
    }
    // Stub: returns success until wired to @ice/core validator
    return {
      valid: true,
      errors: [],
      warnings: [],
      info: [],
    };
  });

  // =========================================
  // File Dialogs
  // =========================================

  ipcMain.handle('dialog:openFile', async () => {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return null;

    const result = await dialog.showOpenDialog(window, {
      title: 'Open ICE Graph',
      filters: [
        { name: 'ICE Graph', extensions: ['ice', 'json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle('dialog:saveFile', async () => {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return null;

    const result = await dialog.showSaveDialog(window, {
      title: 'Save ICE Graph',
      defaultPath: current_file_path || 'infrastructure.ice.json',
      filters: [
        { name: 'ICE Graph', extensions: ['ice.json'] },
        { name: 'JSON', extensions: ['json'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    return result.filePath;
  });

  ipcMain.handle('dialog:importTerraform', async () => {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return null;

    const result = await dialog.showOpenDialog(window, {
      title: 'Import Terraform State',
      filters: [
        { name: 'Terraform State', extensions: ['tfstate'] },
        { name: 'JSON', extensions: ['json'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // Select a directory for project browser
  ipcMain.handle('dialog:selectDirectory', async () => {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return null;

    const result = await dialog.showOpenDialog(window, {
      title: 'Select Projects Directory',
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // =========================================
  // Project List Operations
  // =========================================

  interface ScannedFile {
    id: string;
    name: string;
    path: string;
    parentPath: string; // Parent directory path
    lastModified: number;
  }

  interface ScannedFolder {
    id: string;
    name: string;
    path: string;
    parentPath: string; // Parent directory path
  }

  interface ScanResult {
    files: ScannedFile[];
    folders: ScannedFolder[];
  }

  // Scan directory for .ice/.json files and subdirectories
  async function scanDirectoryForProjects(dirPath: string): Promise<ScanResult> {
    const files: ScannedFile[] = [];
    const folders: ScannedFolder[] = [];
    const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__'];

    async function scanDir(currentPath: string): Promise<void> {
      try {
        const entries = await readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(currentPath, entry.name);

          if (entry.isDirectory()) {
            // Skip common non-project directories
            if (!skipDirs.includes(entry.name) && !entry.name.startsWith('.')) {
              // Add folder to results
              folders.push({
                id: `folder-${randomUUID()}`,
                name: entry.name,
                path: fullPath,
                parentPath: currentPath,
              });
              // Recursively scan subdirectory
              await scanDir(fullPath);
            }
          } else if (entry.isFile()) {
            // Match .ice, .ice.json, and .json files
            const ext = extname(entry.name).toLowerCase();
            const isIceFile =
              entry.name.endsWith('.ice') ||
              entry.name.endsWith('.ice.json') ||
              (ext === '.json' && !entry.name.startsWith('.'));

            if (isIceFile) {
              try {
                const fileStat = await stat(fullPath);
                files.push({
                  id: `file-${randomUUID()}`,
                  name: basename(entry.name, entry.name.endsWith('.ice.json') ? '.ice.json' : ext),
                  path: fullPath,
                  parentPath: currentPath,
                  lastModified: fileStat.mtimeMs,
                });
              } catch {
                // Skip files we can't stat
              }
            }
          }
        }
      } catch {
        // Skip directories we can't read
      }
    }

    await scanDir(dirPath);
    return { files, folders };
  }

  ipcMain.handle('projects:scanDirectory', async (_event, dirPath: string) => {
    if (!dirPath) return { files: [], folders: [] };
    return scanDirectoryForProjects(dirPath);
  });

  // Create a new folder in the filesystem
  ipcMain.handle('projects:createFolder', async (_event, parentPath: string, folderName: string) => {
    if (!parentPath || !folderName) return null;
    try {
      const newFolderPath = join(parentPath, folderName);
      await mkdir(newFolderPath, { recursive: true });
      return newFolderPath;
    } catch (error) {
      console.error('Failed to create folder:', error);
      return null;
    }
  });

  // =========================================
  // Schema Operations
  // =========================================

  // Helper function to load schemas from unified-types.json
  async function load_schemas(): Promise<UnifiedSchema[]> {
    if (schemas_cache) {
      return schemas_cache;
    }

    try {
      // Try multiple paths to find the schemas file
      // __dirname in dev mode is: packages/desktop/dist/main
      // So we need to go up 3 levels to packages/, then into schemas/
      const possible_paths = [
        join(__dirname, '../../../schemas/src/generated/unified-types.json'),
        join(__dirname, '../../../schemas/dist/generated/unified-types.json'),
        join(process.cwd(), 'packages/schemas/src/generated/unified-types.json'),
        join(process.cwd(), 'packages/schemas/dist/generated/unified-types.json'),
        // Absolute fallback
        '/Users/juliakafarska/Desktop/lc-organized/ice/packages/schemas/src/generated/unified-types.json',
      ];

      for (const schema_path of possible_paths) {
        try {
          const content = await readFile(schema_path, 'utf-8');
          schemas_cache = JSON.parse(content) as UnifiedSchema[];
          console.log(`Loaded ${schemas_cache.length} schemas from ${schema_path}`);
          return schemas_cache;
        } catch {
          // Try next path
        }
      }

      console.warn('Could not load unified-types.json, using empty schema list');
      schemas_cache = [];
      return schemas_cache;
    } catch (error) {
      console.error('Error loading schemas:', error);
      schemas_cache = [];
      return schemas_cache;
    }
  }

  ipcMain.handle('schema:getCategories', async () => {
    if (categories_cache) {
      return categories_cache;
    }

    const schemas = await load_schemas();
    const categories = new Set<string>();
    schemas.forEach((s) => {
      if (s.category) {
        // Capitalize first letter for display
        const category = s.category.charAt(0).toUpperCase() + s.category.slice(1).toLowerCase();
        categories.add(category);
      }
    });
    categories_cache = Array.from(categories).sort();
    return categories_cache;
  });

  ipcMain.handle('schema:query', async (_event, query: { category?: string; search?: string; provider?: string }) => {
    const all_schemas = await load_schemas();
    let results = all_schemas;

    if (query.category) {
      const category_lower = query.category.toLowerCase();
      results = results.filter((s) => s.category?.toLowerCase() === category_lower);
    }

    if (query.search) {
      const search_lower = query.search.toLowerCase();
      results = results.filter(
        (s) =>
          s.ice_type.toLowerCase().includes(search_lower) ||
          s.display_name.toLowerCase().includes(search_lower) ||
          (s.description && s.description.toLowerCase().includes(search_lower)),
      );
    }

    if (query.provider) {
      const provider_lower = query.provider.toLowerCase();
      results = results.filter((s) =>
        s.implementations.some((impl) => impl.provider_name.toLowerCase().includes(provider_lower)),
      );
    }

    // Limit results for performance (UI can paginate if needed)
    return results.slice(0, 500);
  });

  ipcMain.handle('schema:get', async (_event, ice_type: string) => {
    const schemas = await load_schemas();
    return schemas.find((s) => s.ice_type === ice_type) || null;
  });

  // =========================================
  // High-Level Resource Operations (User-friendly abstractions)
  // =========================================

  ipcMain.handle('resources:getCategories', async () => {
    return HIGH_LEVEL_CATEGORIES.map((cat) => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      icon: cat.icon,
      resourceCount: cat.resources.length,
    }));
  });

  ipcMain.handle('resources:getAll', async () => {
    return getHighLevelResourcesForPalette();
  });

  ipcMain.handle('resources:getByCategory', async (_event, categoryId: string) => {
    const category = HIGH_LEVEL_CATEGORIES.find((c) => c.id === categoryId);
    if (!category) return [];
    return category.resources.map((r) => ({
      ice_type: r.id,
      display_name: r.name,
      description: r.description,
      category: category.name,
      icon: r.icon,
      properties: r.properties,
    }));
  });

  ipcMain.handle('resources:search', async (_event, query: string) => {
    const queryLower = query.toLowerCase();
    const results: any[] = [];

    for (const category of HIGH_LEVEL_CATEGORIES) {
      for (const resource of category.resources) {
        if (
          resource.name.toLowerCase().includes(queryLower) ||
          resource.description.toLowerCase().includes(queryLower) ||
          resource.keywords.some((k) => k.includes(queryLower))
        ) {
          results.push({
            ice_type: resource.id,
            display_name: resource.name,
            description: resource.description,
            category: category.name,
            icon: resource.icon,
            properties: resource.properties,
          });
        }
      }
    }

    return results;
  });

  // Get underlying low-level resources for a high-level resource
  ipcMain.handle('resources:getLowLevel', async (_event, highLevelId: string) => {
    const allSchemas = await load_schemas();
    const highLevelResource = HIGH_LEVEL_CATEGORIES.flatMap((c) => c.resources).find((r) => r.id === highLevelId);

    if (!highLevelResource) return [];

    // Match low-level resources by keywords
    return allSchemas
      .filter((schema) => {
        const searchText = `${schema.ice_type} ${schema.display_name} ${schema.description || ''}`.toLowerCase();
        return highLevelResource.keywords.some((keyword) => searchText.includes(keyword));
      })
      .slice(0, 50); // Limit results
  });

  // =========================================
  // Window State
  // =========================================

  ipcMain.handle('window:getFilePath', async () => {
    return current_file_path;
  });

  ipcMain.handle('window:isDirty', async () => {
    // Stub: dirty state tracking not yet implemented
    return false;
  });

  // =========================================
  // Provider Operations
  // =========================================

  // Get stored credentials for a provider
  ipcMain.handle('provider:getCredentials', async (_event, providerId: string) => {
    const creds = credentialStore.get(`credentials.${providerId}`) as Record<string, string> | undefined;
    if (!creds) return null;

    // Mask sensitive fields for display
    const masked = { ...creds };
    if (masked.secretAccessKey) masked.secretAccessKey = '********';
    if (masked.clientSecret) masked.clientSecret = '********';
    if (masked.serviceAccountKey) masked.serviceAccountKey = masked.serviceAccountKey.slice(0, 50) + '...';
    return masked;
  });

  // Save credentials for a provider
  ipcMain.handle(
    'provider:saveCredentials',
    async (_event, providerId: string, credentials: Record<string, string>) => {
      credentialStore.set(`credentials.${providerId}`, credentials);
      credentialStore.set(`connected.${providerId}`, true);
      return { success: true };
    },
  );

  // Check if provider is connected
  ipcMain.handle('provider:isConnected', async (_event, providerId: string) => {
    return credentialStore.get(`connected.${providerId}`, false);
  });

  // Disconnect provider
  ipcMain.handle('provider:disconnect', async (_event, providerId: string) => {
    credentialStore.delete(`credentials.${providerId}`);
    credentialStore.delete(`connected.${providerId}`);
    credentialStore.delete(`projects.${providerId}`);
    return { success: true };
  });

  // Connect to provider and list projects
  ipcMain.handle('provider:connect', async (_event, providerId: string, credentials: Record<string, string>) => {
    try {
      let projects: ProviderProject[] = [];

      if (providerId === 'gcp') {
        // Use gcloud CLI to authenticate and list projects
        const gcloudResult = await connectGCPViaGcloud();
        if (!gcloudResult.success) {
          return gcloudResult;
        }
        projects = gcloudResult.projects || [];
        // Store that we're using gcloud auth
        credentialStore.set(`credentials.${providerId}`, { authMethod: 'gcloud' });
      } else if (providerId === 'aws') {
        // Save credentials
        credentialStore.set(`credentials.${providerId}`, credentials);
        // For AWS, list available regions as "projects"
        projects = [
          {
            id: credentials.region || 'us-east-1',
            name: `AWS (${credentials.region || 'us-east-1'})`,
            region: credentials.region || 'us-east-1',
          },
        ];
      } else if (providerId === 'azure') {
        credentialStore.set(`credentials.${providerId}`, credentials);
        projects = [
          {
            id: credentials.subscriptionId,
            name: `Subscription ${credentials.subscriptionId.slice(0, 8)}...`,
          },
        ];
      } else if (providerId === 'kubernetes') {
        credentialStore.set(`credentials.${providerId}`, credentials);
        projects = [{ id: credentials.context, name: credentials.context, region: credentials.namespace }];
      }

      credentialStore.set(`connected.${providerId}`, true);
      credentialStore.set(`projects.${providerId}`, projects);

      return { success: true, projects };
    } catch (error) {
      console.error(`Failed to connect to ${providerId}:`, error);
      return { success: false, error: String(error) };
    }
  });

  // Get projects for a connected provider
  ipcMain.handle('provider:getProjects', async (_event, providerId: string) => {
    return credentialStore.get(`projects.${providerId}`, []);
  });

  // Import infrastructure from provider
  ipcMain.handle('provider:import', async (_event, providerId: string, projectId: string) => {
    try {
      const credentials = credentialStore.get(`credentials.${providerId}`) as Record<string, string>;
      if (!credentials) {
        throw new Error(`No credentials found for ${providerId}`);
      }

      console.log(`Importing from ${providerId} project ${projectId}...`);

      let importedGraph: SerializedGraph;

      if (providerId === 'gcp') {
        // Use GCP importer from core
        // For now, create a sample graph - in real implementation, call the GCP importer
        importedGraph = await importFromGCP(credentials, projectId);
      } else if (providerId === 'aws') {
        importedGraph = await importFromAWS(credentials, projectId);
      } else if (providerId === 'azure') {
        importedGraph = await importFromAzure(credentials, projectId);
      } else {
        throw new Error(`Import not implemented for ${providerId}`);
      }

      // Set as current graph
      current_graph = SimpleGraph.deserialize(importedGraph);
      current_file_path = null;

      return { success: true, graph: importedGraph };
    } catch (error) {
      console.error(`Import failed for ${providerId}:`, error);
      return { success: false, error: String(error) };
    }
  });

  // =========================================
  // GitHub Operations
  // =========================================

  const githubService = new GitHubService(credentialStore);

  ipcMain.handle('github:isConnected', async () => {
    return githubService.isConnected();
  });

  ipcMain.handle('github:getUser', async () => {
    return githubService.getStoredUser();
  });

  ipcMain.handle('github:connectPAT', async (_event, token: string) => {
    try {
      const user = await githubService.connectWithPAT(token);
      return { success: true, user };
    } catch (error: any) {
      return { success: false, error: error.message || String(error) };
    }
  });

  ipcMain.handle('github:startDeviceFlow', async () => {
    try {
      const response = await githubService.startDeviceFlow();
      githubService.openDeviceFlowPage(response.verification_uri);
      return { success: true, ...response };
    } catch (error: any) {
      return { success: false, error: error.message || String(error) };
    }
  });

  ipcMain.handle('github:pollDeviceFlow', async (_event, deviceCode: string, interval: number) => {
    try {
      const user = await githubService.pollDeviceFlow(deviceCode, interval);
      return { success: true, user };
    } catch (error: any) {
      return { success: false, error: error.message || String(error) };
    }
  });

  ipcMain.handle('github:disconnect', async () => {
    githubService.disconnect();
    return { success: true };
  });

  ipcMain.handle('github:listRepos', async (_event, page?: number) => {
    try {
      const repos = await githubService.listRepos(page);
      return { success: true, repos };
    } catch (error: any) {
      return { success: false, error: error.message || String(error) };
    }
  });

  ipcMain.handle('github:listBranches', async (_event, owner: string, repo: string) => {
    try {
      const branches = await githubService.listBranches(owner, repo);
      return { success: true, branches };
    } catch (error: any) {
      return { success: false, error: error.message || String(error) };
    }
  });

  // =========================================
  // Template Operations
  // =========================================

  ipcMain.handle('templates:loadToGraph', async (_event, data: { name: string; nodes: any[]; edges: any[] }) => {
    const graph = new SimpleGraph(data.name, '1.0.0');

    // Map from template node IDs to new graph node IDs
    const idMap = new Map<string, string>();

    // Add all nodes
    for (const node of data.nodes) {
      const result = graph.add_node({
        type: node.data?.iceType || 'Application.Container',
        name: node.data?.label || node.id,
        properties: node.data?.properties || {},
      });
      idMap.set(node.id, result.node.id);
    }

    // Add all edges (remap IDs)
    for (const edge of data.edges) {
      const sourceId = idMap.get(edge.source);
      const targetId = idMap.get(edge.target);
      if (sourceId && targetId) {
        graph.add_edge({
          source: sourceId,
          target: targetId,
          relationship: edge.data?.relationship || 'depends_on',
        });
      }
    }

    // Set as current graph
    current_graph = graph;
    current_file_path = null;

    return graph.serialize();
  });
}

// =========================================
// Shell command helper
// =========================================

const execAsync = promisify(exec);

async function runCommand(command: string): Promise<{ stdout: string; stderr: string }> {
  return execAsync(command, { timeout: 30000 });
}

/**
 * Run an interactive command (like gcloud auth) that opens browser for OAuth.
 * Uses spawn with stdio inherit to allow browser-based auth flow.
 */
async function runInteractiveCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command "${command} ${args.join(' ')}" failed with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

// =========================================
// GCP gcloud CLI Functions
// =========================================

export async function connectGCPViaGcloud(): Promise<{
  success: boolean;
  projects?: ProviderProject[];
  error?: string;
}> {
  try {
    // Check if gcloud is installed
    try {
      await runCommand('gcloud --version');
    } catch {
      return {
        success: false,
        error: 'gcloud CLI is not installed.\n\nInstall from: https://cloud.google.com/sdk/docs/install',
      };
    }

    // Check if user is authenticated, if not - run gcloud auth login
    let account = '';
    try {
      const { stdout } = await runCommand('gcloud auth list --filter=status:ACTIVE --format="value(account)"');
      account = stdout.trim();
    } catch {
      // Ignore error, account will be empty
    }

    if (!account) {
      console.log('Not logged in to gcloud, launching auth flow...');
      try {
        // Run gcloud auth login - this opens a browser for OAuth (interactive)
        await runInteractiveCommand('gcloud', ['auth', 'login']);
        // Check again for account
        const { stdout } = await runCommand('gcloud auth list --filter=status:ACTIVE --format="value(account)"');
        account = stdout.trim();
        if (!account) {
          return {
            success: false,
            error: 'Authentication was cancelled or failed. Please try again.',
          };
        }
      } catch (authError: any) {
        return {
          success: false,
          error: `Authentication failed: ${authError.message || String(authError)}`,
        };
      }
    }

    console.log(`gcloud authenticated as: ${account}`);

    // Check/setup Application Default Credentials
    let hasADC = false;
    try {
      await runCommand('gcloud auth application-default print-access-token 2>/dev/null');
      hasADC = true;
    } catch {
      // ADC not configured
    }

    if (!hasADC) {
      console.log('Setting up Application Default Credentials...');
      try {
        // Run gcloud auth application-default login - also opens browser (interactive)
        await runInteractiveCommand('gcloud', ['auth', 'application-default', 'login']);
      } catch (adcError: any) {
        return {
          success: false,
          error: `Failed to set up Application Default Credentials: ${adcError.message || String(adcError)}`,
        };
      }
    }

    // List accessible projects
    let projectsOutput: string;
    try {
      const result = await runCommand('gcloud projects list --format="json"');
      projectsOutput = result.stdout;
    } catch (listError: any) {
      // If tokens expired, force re-authentication
      if (listError.message?.includes('Reauthentication') || listError.message?.includes('auth tokens')) {
        console.log('Auth tokens expired, forcing re-authentication...');
        try {
          // Use interactive command for re-auth (opens browser)
          await runInteractiveCommand('gcloud', ['auth', 'login', '--force']);
          const result = await runCommand('gcloud projects list --format="json"');
          projectsOutput = result.stdout;
        } catch (reAuthError: any) {
          return {
            success: false,
            error: `Re-authentication failed: ${reAuthError.message || String(reAuthError)}`,
          };
        }
      } else {
        throw listError;
      }
    }

    const projectsList = JSON.parse(projectsOutput || '[]');

    const projects: ProviderProject[] = projectsList.map((p: any) => ({
      id: p.projectId,
      name: p.name || p.projectId,
    }));

    console.log(`Found ${projects.length} GCP projects`);
    return { success: true, projects };
  } catch (error: any) {
    console.error('GCP gcloud error:', error);
    return {
      success: false,
      error: `gcloud error: ${error.message || String(error)}`,
    };
  }
}

// =========================================
// Provider Import Functions
// =========================================

// Use the core importers - no duplicated code
async function importFromGCP(_credentials: Record<string, string>, projectId: string): Promise<SerializedGraph> {
  console.log(`Starting GCP import for project: ${projectId}`);

  if (!projectId) {
    throw new Error('Project ID is required');
  }

  // Use the core GCP importer (uses ADC from gcloud auth application-default login)
  const { graph, result } = await import_gcp_to_graph(
    { project: projectId, services: ['all'], infer_dependencies: true },
    `GCP Import - ${projectId}`,
  );

  console.log(`GCP import complete: ${result.resources.length} resources found`);

  // Print full result for debugging
  console.log('\n=== IMPORT RESULT ===');
  console.log('Resources:', JSON.stringify(result.resources, null, 2));
  console.log('Errors:', result.errors);
  console.log('Warnings:', result.warnings);
  console.log('Metadata:', result.metadata);
  console.log('=========================\n');

  // Check for authentication errors and auto-trigger re-auth
  const authError = result.errors.find(
    (e) => e.code === 'AUTH_REAUTH_REQUIRED' || e.code === 'AUTH_REQUIRED' || e.code === 'AUTH_EXPIRED',
  );

  if (authError) {
    console.log('Authentication error detected, triggering re-authentication...');

    // Spawn gcloud auth command to open browser
    const { spawn } = await import('child_process');

    const authProcess = spawn('gcloud', ['auth', 'application-default', 'login'], {
      stdio: 'inherit',
      shell: true,
    });

    await new Promise<void>((resolve, reject) => {
      authProcess.on('close', (code) => {
        if (code === 0) {
          console.log('Re-authentication successful!');
          resolve();
        } else {
          reject(new Error(`Authentication failed with code ${code}`));
        }
      });
      authProcess.on('error', reject);
    });

    // Throw error to indicate retry is needed
    throw new Error('Re-authentication completed. Please try the import again.');
  }

  if (result.errors.length > 0) {
    console.warn('Import errors:', result.errors);
  }

  // Generate unique debug ID for serialization
  const serializeDebugId = `SERIALIZE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Convert MutableGraph to SerializedGraph format with proper ICE structure
  const serialized = graph.to_json();
  const now = new Date().toISOString();

  console.log(`\n[${serializeDebugId}] ========== GRAPH SERIALIZATION DEBUG ==========`);
  console.log(
    `[${serializeDebugId}] Raw graph has ${serialized.nodes.length} nodes and ${serialized.edges.length} edges`,
  );

  // Log all raw node types
  const rawTypeCounts: Record<string, number> = {};
  serialized.nodes.forEach((node: any) => {
    rawTypeCounts[node.type] = (rawTypeCounts[node.type] || 0) + 1;
  });
  console.log(`[${serializeDebugId}] Raw node types:`);
  Object.entries(rawTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`[${serializeDebugId}]   ${type}: ${count}`);
    });

  // Get behavior mapping for types
  const behaviorMap: Record<string, string> = {
    'Network.VPC': 'container',
    'Network.Subnet': 'container',
    'Network.LoadBalancer': 'connector',
    'Network.CDN': 'connector',
    'Network.DNS': 'singleton',
    'Application.API': 'connector',
    'Application.Container': 'scalable',
    'Application.Function': 'scalable',
    'Application.Worker': 'scalable',
    'Application.CronJob': 'singleton',
    'Database.PostgreSQL': 'stateful',
    'Database.Redis': 'stateful',
    'Database.NoSQL': 'stateful',
    'Database.DataWarehouse': 'stateful',
    'Storage.Bucket': 'stateful',
    'Storage.FileSystem': 'stateful',
    'Messaging.EventBus': 'streaming',
    'Messaging.Queue': 'streaming',
    'Security.Secret': 'singleton',
    'Security.Identity': 'singleton',
    'Security.Certificate': 'singleton',
    'Security.Key': 'singleton',
    'Monitoring.LogGroup': 'streaming',
    'Monitoring.Alert': 'singleton',
    'Monitoring.Dashboard': 'singleton',
  };

  // Filter to only high-level ICE types (exclude low-level gcp.* types)
  const highLevelNodes = serialized.nodes.filter((node: any) => {
    const type = node.type as string;
    // Keep high-level types like Network.VPC, Application.Container, etc.
    const isHighLevel = !type.startsWith('gcp.') && type.includes('.');
    if (!isHighLevel) {
      console.log(`[${serializeDebugId}] FILTERED OUT: ${node.name} (type=${type})`);
    }
    return isHighLevel;
  });

  console.log(`[${serializeDebugId}] After filtering: ${highLevelNodes.length} high-level nodes`);

  // Log filtered node types
  const filteredTypeCounts: Record<string, number> = {};
  highLevelNodes.forEach((node: any) => {
    filteredTypeCounts[node.type] = (filteredTypeCounts[node.type] || 0) + 1;
  });
  console.log(`[${serializeDebugId}] High-level node types after filter:`);
  Object.entries(filteredTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`[${serializeDebugId}]   ${type}: ${count}`);
    });

  // Log each high-level node
  console.log(`[${serializeDebugId}] High-level nodes:`);
  highLevelNodes.forEach((node: any, i: number) => {
    console.log(`[${serializeDebugId}]   ${i + 1}. [${node.id}] ${node.type} - ${node.name}`);
  });

  // Build VPC → Subnet → Resource containment
  const vpcs = highLevelNodes.filter((n: any) => n.type === 'Network.VPC');
  const subnets = highLevelNodes.filter((n: any) => n.type === 'Network.Subnet');
  const otherResources = highLevelNodes.filter((n: any) => n.type !== 'Network.VPC' && n.type !== 'Network.Subnet');

  // Create contains edges
  const containsEdges: any[] = [];

  // VPCs contain subnets (match by network property, self_link, or naming pattern)
  console.log(`[${serializeDebugId}] Building containment: ${vpcs.length} VPCs, ${subnets.length} subnets`);

  for (const vpc of vpcs) {
    // Get VPC identifiers
    const vpcName = vpc.properties?.name || vpc.name;
    const vpcSelfLink = vpc.properties?._gcp_self_link as string | undefined;
    console.log(`[${serializeDebugId}] VPC: id=${vpc.id}, name=${vpcName}`);

    for (const subnet of subnets) {
      // Get subnet identifiers
      const subnetNetwork = subnet.properties?.network as string | undefined;
      const subnetName = subnet.name || '';

      // Check if subnet belongs to this VPC
      const belongsToVpc =
        // Subnet's network property contains VPC name/link
        (subnetNetwork && vpcName && String(subnetNetwork).includes(String(vpcName))) ||
        // Subnet's network property matches VPC self_link
        (subnetNetwork && vpcSelfLink && String(subnetNetwork).includes(vpcSelfLink)) ||
        // Subnet name starts with VPC name (e.g., "default-europe-west1" for VPC "default")
        (vpcName && subnetName.startsWith(`${vpcName}-`)) ||
        // All "default" subnets belong to the "default" VPC
        (vpcName === 'default' && subnetName.startsWith('default'));

      if (belongsToVpc) {
        console.log(`[${serializeDebugId}] MATCH: VPC ${vpcName} contains subnet ${subnetName}`);
        containsEdges.push({
          id: `${vpc.id}-contains-${subnet.id}`,
          source: vpc.id,
          target: subnet.id,
          relationship: 'contains',
          metadata: { created_at: now, labels: {} },
        });
      }
    }
  }
  console.log(`[${serializeDebugId}] Created ${containsEdges.length} VPC->Subnet contains edges`);

  // Assign REGIONAL resources to their region's subnet for visual organization
  // This groups resources by region even if they're managed services

  // Global resources that should NOT be in any subnet (they're project-wide)
  const globalTypes = new Set([
    'Security.Secret', // Secrets are global
    'Security.Identity', // Service accounts are global
    'Security.Key', // KMS keys are global
    'Network.DNS', // DNS zones are global
  ]);

  for (const resource of otherResources) {
    // Skip global resources - they don't belong in any region
    if (globalTypes.has(resource.type)) {
      console.log(`[${serializeDebugId}] Skipping global resource: ${resource.name} (${resource.type})`);
      continue;
    }

    // Try multiple ways to find the region
    let resourceRegion =
      resource.properties?.region ||
      (resource.properties?.zone as string)?.replace(/-[a-z]$/, '') || // Extract region from zone
      (resource.metadata as any)?.region ||
      (resource.metadata as any)?.labels?.region;

    // For buckets/storage: location can be regional or multi-regional
    if (!resourceRegion && resource.properties?.location) {
      const location = String(resource.properties.location).toLowerCase();
      // Check if it's already a region (contains a hyphen like "europe-west1")
      if (location.includes('-')) {
        resourceRegion = location;
      } else {
        // Map multi-regional to a default region
        const multiRegionMap: Record<string, string> = {
          eu: 'europe-west1',
          us: 'us-central1',
          asia: 'asia-east1',
        };
        resourceRegion = multiRegionMap[location];
      }
    }

    // Try to extract from _gcp_self_link if present (works for databases, etc.)
    if (!resourceRegion && resource.properties?._gcp_self_link) {
      const selfLink = String(resource.properties._gcp_self_link);

      // Try regions/locations/zones pattern
      let regionMatch = selfLink.match(/(?:regions|locations|zones)\/([^/]+)/);
      if (regionMatch) {
        let loc = regionMatch[1];
        // If it's a zone (e.g., "us-central1-a"), extract region
        if (loc.match(/^[a-z]+-[a-z]+\d+-[a-z]$/)) {
          loc = loc.replace(/-[a-z]$/, '');
        }
        resourceRegion = loc;
      }

      // For Cloud SQL: .../projects/PROJECT/instances/INSTANCE
      // The region is in the settings or we can try to find it in another way
      if (!resourceRegion) {
        // Try to match region pattern anywhere in the URL
        regionMatch = selfLink.match(
          /(europe-\w+\d*|us-\w+\d*|asia-\w+\d*|australia-\w+\d*|northamerica-\w+\d*|southamerica-\w+\d*)/i,
        );
        if (regionMatch) {
          resourceRegion = regionMatch[1].toLowerCase();
        }
      }

      // For storage buckets, extract location from the bucket's location metadata
      // stored in _gcp_location if present
      if (!resourceRegion && resource.properties?._gcp_location) {
        const loc = String(resource.properties._gcp_location).toLowerCase();
        if (loc.includes('-')) {
          resourceRegion = loc;
        } else {
          const multiRegionMap: Record<string, string> = {
            eu: 'europe-west1',
            us: 'us-central1',
            asia: 'asia-east1',
          };
          resourceRegion = multiRegionMap[loc];
        }
      }
    }

    // Try to extract region from name (e.g., "run-sources-lc-console-staging-europe-west1")
    if (!resourceRegion && resource.name) {
      const regionMatch = resource.name.match(
        /(europe-\w+\d*|us-\w+\d*|asia-\w+\d*|australia-\w+\d*|northamerica-\w+\d*|southamerica-\w+\d*)/i,
      );
      if (regionMatch) {
        resourceRegion = regionMatch[1].toLowerCase();
      }
    }

    // Try metadata location
    if (!resourceRegion) {
      resourceRegion = (resource.metadata as any)?.location;
    }

    if (!resourceRegion) {
      console.log(
        `[${serializeDebugId}] No region for: ${resource.name} (${resource.type}) - props: ${JSON.stringify(Object.keys(resource.properties || {}))}`,
      );
      continue;
    }

    console.log(`[${serializeDebugId}] Found region ${resourceRegion} for: ${resource.name}`);

    // Find a subnet in the same region
    const matchingSubnet = subnets.find((s: any) => {
      // Check properties.region first
      const subnetRegion = s.properties?.region;
      if (subnetRegion && String(subnetRegion) === String(resourceRegion)) {
        return true;
      }
      // Also check if subnet name ends with the region (e.g., "default-europe-west1")
      const subnetName = s.name || '';
      if (subnetName.endsWith(`-${resourceRegion}`)) {
        return true;
      }
      return false;
    });

    if (matchingSubnet) {
      console.log(`[${serializeDebugId}] Placing ${resource.name} (${resource.type}) in subnet ${matchingSubnet.name}`);
      containsEdges.push({
        id: `${matchingSubnet.id}-contains-${resource.id}`,
        source: matchingSubnet.id,
        target: resource.id,
        relationship: 'contains',
        metadata: { created_at: now, labels: {} },
      });
    } else {
      console.log(`[${serializeDebugId}] No matching subnet for: ${resource.name} region=${resourceRegion}`);
    }
  }

  // Auto-layout positioning with dynamic sizing
  const nodePositions: Record<string, { x: number; y: number }> = {};
  const nodeSizes: Record<string, { width: number; height: number }> = {};

  // Build a set of resources that are contained in subnets
  const containedResourceIds = new Set(
    containsEdges.filter((e: any) => subnets.some((s: any) => s.id === e.source)).map((e: any) => e.target),
  );

  // Count children per subnet
  const subnetChildCounts: Record<string, number> = {};
  for (const edge of containsEdges) {
    if (subnets.some((s: any) => s.id === edge.source)) {
      subnetChildCounts[edge.source] = (subnetChildCounts[edge.source] || 0) + 1;
    }
  }

  // Separate resources into those in subnets vs top-level
  const topLevelResources = otherResources.filter((r: any) => !containedResourceIds.has(r.id));
  const subnetResources = otherResources.filter((r: any) => containedResourceIds.has(r.id));

  // Resource node dimensions with proper buffer spacing
  const resourceNodeWidth = 220;
  const resourceNodeHeight = 70;
  const resourceGapInSubnet = 20; // Gap between resources inside subnets
  const subnetInnerBuffer = 25; // Buffer from subnet border to resources
  const subnetHeaderHeight = 50; // Height of subnet header
  const resourcesPerRowInSubnet = 2;

  // Calculate subnet size based on number of children (with proper buffer)
  function calcSubnetSize(childCount: number): { width: number; height: number } {
    if (childCount === 0) {
      return { width: 280, height: 100 };
    }
    const cols = Math.min(childCount, resourcesPerRowInSubnet);
    const rows = Math.ceil(childCount / resourcesPerRowInSubnet);
    // Width: buffer + resources + gaps + buffer
    const width = subnetInnerBuffer * 2 + cols * resourceNodeWidth + (cols - 1) * resourceGapInSubnet;
    // Height: header + buffer + resources + gaps + buffer
    const height =
      subnetHeaderHeight +
      subnetInnerBuffer +
      rows * resourceNodeHeight +
      (rows - 1) * resourceGapInSubnet +
      subnetInnerBuffer;
    return { width: Math.max(280, width), height: Math.max(150, height) };
  }

  // Calculate sizes for all subnets
  const subnetSizes: Record<string, { width: number; height: number }> = {};
  for (const subnet of subnets) {
    const childCount = subnetChildCounts[subnet.id] || 0;
    subnetSizes[subnet.id] = calcSubnetSize(childCount);
  }

  // Only show subnets that have children (to avoid empty space)
  const subnetsWithChildren = subnets.filter((s: any) => (subnetChildCounts[s.id] || 0) > 0);
  const emptySubnets = subnets.filter((s: any) => (subnetChildCounts[s.id] || 0) === 0);

  console.log(
    `[${serializeDebugId}] Subnets with children: ${subnetsWithChildren.length}, empty: ${emptySubnets.length}`,
  );

  // Calculate VPC size based on subnets with children
  const subnetsPerRow = 3;
  const subnetPadding = 20;
  const vpcPadding = 30;
  const vpcHeaderHeight = 50;

  // Get max subnet dimensions for layout
  let maxSubnetWidth = 280;
  let maxSubnetHeight = 100;
  for (const subnet of subnetsWithChildren) {
    const size = subnetSizes[subnet.id];
    maxSubnetWidth = Math.max(maxSubnetWidth, size.width);
    maxSubnetHeight = Math.max(maxSubnetHeight, size.height);
  }

  const activeSubnetRows = Math.ceil(subnetsWithChildren.length / subnetsPerRow);
  const vpcWidth = Math.max(800, subnetsPerRow * (maxSubnetWidth + subnetPadding) + vpcPadding * 2);
  const vpcHeight = Math.max(400, vpcHeaderHeight + activeSubnetRows * (maxSubnetHeight + subnetPadding) + vpcPadding);

  // Position VPCs at the top
  let vpcX = 50;
  const vpcY = 50;
  for (const vpc of vpcs) {
    nodePositions[vpc.id] = { x: vpcX, y: vpcY };
    nodeSizes[vpc.id] = { width: vpcWidth, height: vpcHeight };
    vpcX += vpcWidth + 50;
  }

  // Position subnets WITH children inside VPCs (relative to VPC)
  let subnetCol = 0;
  let subnetRow = 0;
  for (const subnet of subnetsWithChildren) {
    const size = subnetSizes[subnet.id];
    const x = vpcPadding + subnetCol * (maxSubnetWidth + subnetPadding);
    const y = vpcHeaderHeight + subnetRow * (maxSubnetHeight + subnetPadding);
    nodePositions[subnet.id] = { x, y };
    nodeSizes[subnet.id] = size;

    subnetCol++;
    if (subnetCol >= subnetsPerRow) {
      subnetCol = 0;
      subnetRow++;
    }
  }

  // Position empty subnets in a collapsed area or hide them
  // For now, position them small at the bottom of the VPC
  const emptySubnetSize = { width: 150, height: 40 };
  let emptyCol = 0;
  const emptyY = vpcHeaderHeight + activeSubnetRows * (maxSubnetHeight + subnetPadding) + 10;
  for (const subnet of emptySubnets) {
    const x = vpcPadding + emptyCol * (emptySubnetSize.width + 10);
    nodePositions[subnet.id] = { x, y: emptyY };
    nodeSizes[subnet.id] = emptySubnetSize;
    emptyCol++;
    if (emptyCol >= 5) {
      emptyCol = 0;
    }
  }

  // Position resources that are inside subnets (relative to subnet)
  const subnetChildIndex: Record<string, number> = {};
  for (const resource of subnetResources) {
    const parentEdge = containsEdges.find((e: any) => e.target === resource.id);
    if (parentEdge) {
      const idx = subnetChildIndex[parentEdge.source] || 0;
      const col = idx % resourcesPerRowInSubnet;
      const row = Math.floor(idx / resourcesPerRowInSubnet);
      // Use consistent spacing variables defined above
      const x = subnetInnerBuffer + col * (resourceNodeWidth + resourceGapInSubnet);
      const y = subnetHeaderHeight + subnetInnerBuffer + row * (resourceNodeHeight + resourceGapInSubnet);
      nodePositions[resource.id] = { x, y };
      // Set explicit size for resource nodes
      nodeSizes[resource.id] = { width: resourceNodeWidth, height: resourceNodeHeight };
      subnetChildIndex[parentEdge.source] = idx + 1;
    }
  }

  // Position TOP-LEVEL resources BELOW the VPC area with proper spacing
  const topLevelStartY = vpcY + vpcHeight + 80; // More buffer below VPC
  const topLevelGap = 25; // Gap between top-level resources
  let resourceX = 50;
  let resourceY = topLevelStartY;
  const resourcesPerRow = 5;
  let resourceCol = 0;

  for (const resource of topLevelResources) {
    nodePositions[resource.id] = { x: resourceX, y: resourceY };
    // Set explicit size for top-level resource nodes
    nodeSizes[resource.id] = { width: resourceNodeWidth, height: resourceNodeHeight };
    resourceCol++;
    resourceX += resourceNodeWidth + topLevelGap;

    if (resourceCol >= resourcesPerRow) {
      resourceCol = 0;
      resourceX = 50;
      resourceY += resourceNodeHeight + topLevelGap + 10; // Extra vertical gap between rows
    }
  }

  // Combine original edges with contains edges
  const allEdges = [
    ...serialized.edges.map((edge: any) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      relationship: edge.relationship || 'depends_on',
      metadata: {
        created_at: edge.metadata?.created_at || now,
        labels: edge.metadata?.labels || edge.labels || {},
      },
    })),
    ...containsEdges,
  ];

  // Filter edges to only include nodes that exist
  const nodeIds = new Set(highLevelNodes.map((n: any) => n.id));
  const validEdges = allEdges.filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target));

  const finalResult = {
    id: serialized.id,
    name: serialized.name || `GCP Import - ${projectId}`,
    version: serialized.version || '1.0.0',
    nodes: highLevelNodes.map((node: any) => ({
      id: node.id,
      type: node.type,
      name: node.name,
      properties: node.properties || {},
      position: nodePositions[node.id] || { x: 100, y: 100 },
      size: nodeSizes[node.id],
      behavior: behaviorMap[node.type] || 'singleton',
      metadata: {
        created_at: node.metadata?.created_at || now,
        updated_at: node.metadata?.updated_at || now,
        labels: node.metadata?.labels || node.labels || {},
      },
    })),
    edges: validEdges,
    metadata: {
      imported_from: 'gcp',
      project_id: projectId,
      imported_at: now,
      resource_count: highLevelNodes.length,
    },
  };

  console.log(`[${serializeDebugId}] ========== FINAL OUTPUT ==========`);
  console.log(`[${serializeDebugId}] Final nodes: ${finalResult.nodes.length}`);
  console.log(`[${serializeDebugId}] Final edges: ${finalResult.edges.length}`);
  console.log(`[${serializeDebugId}] Contains edges: ${containsEdges.length}`);
  console.log(
    `[${serializeDebugId}] VPCs: ${vpcs.length}, Subnets: ${subnets.length}, Other: ${otherResources.length}`,
  );
  console.log(`[${serializeDebugId}] ==========================================\n`);

  return finalResult;
}

async function importFromAWS(credentials: Record<string, string>, region: string): Promise<SerializedGraph> {
  console.log(`Starting AWS import for region: ${region}`);

  try {
    // Set AWS credentials environment variables
    process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
    process.env.AWS_DEFAULT_REGION = region;

    const importOptions: AWSImportOptions = {
      regions: [region],
      services: ['all'],
      infer_dependencies: true,
    };

    const { graph, result } = await import_aws_to_graph(importOptions, `AWS Import - ${region}`);

    console.log(`AWS import complete: ${result.resources.length} resources found`);

    const serialized = graph.to_json();
    const now = new Date().toISOString();

    return {
      id: serialized.id,
      name: serialized.name || `AWS Import - ${region}`,
      version: serialized.version || '1.0.0',
      nodes: serialized.nodes.map((node: any) => ({
        id: node.id,
        type: node.type,
        name: node.name,
        properties: node.properties || {},
        metadata: {
          created_at: node.metadata?.created_at || now,
          updated_at: node.metadata?.updated_at || now,
          labels: node.metadata?.labels || node.labels || {},
        },
      })),
      edges: serialized.edges.map((edge: any) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        relationship: edge.relationship || 'depends_on',
        metadata: {
          created_at: edge.metadata?.created_at || now,
          labels: edge.metadata?.labels || edge.labels || {},
        },
      })),
      metadata: {
        imported_from: 'aws',
        region,
        imported_at: now,
        resource_count: result.resources.length,
      },
    };
  } finally {
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_DEFAULT_REGION;
  }
}

async function importFromAzure(credentials: Record<string, string>, subscriptionId: string): Promise<SerializedGraph> {
  console.log(`Starting Azure import for subscription: ${subscriptionId}`);

  try {
    // Set Azure credentials environment variables
    process.env.AZURE_SUBSCRIPTION_ID = credentials.subscriptionId;
    process.env.AZURE_TENANT_ID = credentials.tenantId;
    process.env.AZURE_CLIENT_ID = credentials.clientId;
    process.env.AZURE_CLIENT_SECRET = credentials.clientSecret;

    const importOptions: AzureImportOptions = {
      subscriptions: [subscriptionId],
      infer_dependencies: true,
    };

    const { graph, result } = await import_azure_to_graph(importOptions, `Azure Import - ${subscriptionId}`);

    console.log(`Azure import complete: ${result.resources.length} resources found`);

    const serialized = graph.to_json();
    const now = new Date().toISOString();

    return {
      id: serialized.id,
      name: serialized.name || `Azure Import - ${subscriptionId}`,
      version: serialized.version || '1.0.0',
      nodes: serialized.nodes.map((node: any) => ({
        id: node.id,
        type: node.type,
        name: node.name,
        properties: node.properties || {},
        metadata: {
          created_at: node.metadata?.created_at || now,
          updated_at: node.metadata?.updated_at || now,
          labels: node.metadata?.labels || node.labels || {},
        },
      })),
      edges: serialized.edges.map((edge: any) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        relationship: edge.relationship || 'depends_on',
        metadata: {
          created_at: edge.metadata?.created_at || now,
          labels: edge.metadata?.labels || edge.labels || {},
        },
      })),
      metadata: {
        imported_from: 'azure',
        subscription_id: subscriptionId,
        imported_at: now,
        resource_count: result.resources.length,
      },
    };
  } finally {
    delete process.env.AZURE_SUBSCRIPTION_ID;
    delete process.env.AZURE_TENANT_ID;
    delete process.env.AZURE_CLIENT_ID;
    delete process.env.AZURE_CLIENT_SECRET;
  }
}
