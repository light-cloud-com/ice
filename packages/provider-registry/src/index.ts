export interface ProviderDefinition {
  id: string;
  name: string;
  regions: ProviderRegion[];
  auth: ProviderAuth;
  createDeployer: () => ProviderDeployer;
}

export interface ProviderRegion {
  id: string;
  name: string;
  location?: string;
}

export interface ProviderAuth {
  serviceAccount?: boolean;
  oauth?: boolean;
  accessKey?: boolean;
}

export interface ProviderDeployer {
  deploy(graph: unknown, options: DeployOptions): Promise<DeployResult>;
  destroy?(deploymentId: string, options: DeployOptions): Promise<DeployResult>;
  getStatus?(deploymentId: string): Promise<DeployStatus>;
}

export interface DeployOptions {
  projectId?: string;
  region?: string;
  credentials?: Record<string, unknown>;
  dryRun?: boolean;
}

export interface DeployResult {
  success: boolean;
  deploymentId?: string;
  resources?: DeployedResource[];
  errors?: string[];
}

export interface DeployedResource {
  name: string;
  type: string;
  status: string;
  url?: string;
}

export interface DeployStatus {
  status: 'pending' | 'deploying' | 'deployed' | 'failed' | 'destroying' | 'destroyed';
  resources?: DeployedResource[];
  error?: string;
}

export interface ResourceHandler {
  resourceType: string;
  requiredApis?: string[];
  create(name: string, props: Record<string, unknown>, ctx: ResourceContext): Promise<ResourceResult>;
  update(
    name: string,
    props: Record<string, unknown>,
    current: Record<string, unknown>,
    ctx: ResourceContext,
  ): Promise<ResourceResult>;
  delete(name: string, providerId: string, ctx: ResourceContext): Promise<ResourceResult>;
}

export interface ResourceContext {
  projectId: string;
  region: string;
  credentials: Record<string, unknown>;
}

export interface ResourceResult {
  success: boolean;
  outputs?: Record<string, unknown>;
  error?: string;
}

const providerRegistry = new Map<string, ProviderDefinition>();

export function defineProvider(definition: ProviderDefinition): ProviderDefinition {
  providerRegistry.set(definition.id, definition);
  return definition;
}

export function getProvider(id: string): ProviderDefinition | undefined {
  return providerRegistry.get(id);
}

export function getAllProviders(): ProviderDefinition[] {
  return Array.from(providerRegistry.values());
}

export function getProviderRegistry() {
  return {
    get: getProvider,
    getAll: getAllProviders,
    createDeployer: (providerId: string) => {
      const provider = providerRegistry.get(providerId);
      if (!provider) throw new Error(`Provider '${providerId}' not registered`);
      return provider.createDeployer();
    },
  };
}

export function clearProviderRegistry(): void {
  providerRegistry.clear();
}
