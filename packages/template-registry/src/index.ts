export interface TemplateDefinition {
  id: string;
  name: string;
  description?: string;
  category?: string;
  providers: string[];
  nodes: TemplateNode[];
  edges: TemplateEdge[];
  variables?: TemplateVariable[];
}

export interface TemplateNode {
  ref: string;
  block: string;
  label: string;
  position?: { x: number; y: number };
  overrides?: Record<string, unknown>;
}

export interface TemplateEdge {
  from: string;
  to: string;
  relationship?: string;
}

export interface TemplateVariable {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  default?: unknown;
  description?: string;
}

const templateRegistry = new Map<string, TemplateDefinition>();

export function defineTemplate(definition: TemplateDefinition): TemplateDefinition {
  templateRegistry.set(definition.id, definition);
  return definition;
}

export function getTemplate(id: string): TemplateDefinition | undefined {
  return templateRegistry.get(id);
}

export function getAllTemplates(): TemplateDefinition[] {
  return Array.from(templateRegistry.values());
}

export function getTemplatesByProvider(provider: string): TemplateDefinition[] {
  return getAllTemplates().filter(t => t.providers.includes(provider));
}

export function clearTemplateRegistry(): void {
  templateRegistry.clear();
}
