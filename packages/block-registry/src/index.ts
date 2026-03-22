export interface BlockDefinition {
  id: string;
  name: string;
  iceType: string;
  category: string;
  providers: string[];
  defaults?: Record<string, unknown>;
  properties?: BlockProperty[];
  deploy?: BlockDeployConfig;
  connections?: BlockConnections;
  icon?: string;
  description?: string;
}

export interface BlockProperty {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'json';
  required?: boolean;
  default?: unknown;
  options?: { label: string; value: string }[];
  description?: string;
}

export interface BlockDeployConfig {
  resourceType: string;
  requiredApis?: string[];
  extractProperties?: (data: Record<string, unknown>, region: string) => Record<string, unknown>;
}

export interface BlockConnections {
  accepts?: string[];
  provides?: string[];
}

const blockRegistry = new Map<string, BlockDefinition>();

export function defineBlock(definition: BlockDefinition): BlockDefinition {
  blockRegistry.set(definition.id, definition);
  return definition;
}

export function getBlock(id: string): BlockDefinition | undefined {
  return blockRegistry.get(id);
}

export function getAllBlocks(): BlockDefinition[] {
  return Array.from(blockRegistry.values());
}

export function getBlocksByCategory(category: string): BlockDefinition[] {
  return getAllBlocks().filter(b => b.category === category);
}

export function getBlocksByProvider(provider: string): BlockDefinition[] {
  return getAllBlocks().filter(b => b.providers.includes(provider));
}

export function clearRegistry(): void {
  blockRegistry.clear();
}
