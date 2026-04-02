/**
 * Schema Customization Loader
 *
 * Loads user schema customizations from the .ice/schemas/ directory.
 * This loader scans for custom providers, overrides, custom resources,
 * and custom relationships that can be merged with the base schema database.
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface CustomizationPaths {
  providers_dir: string;
  overrides_dir: string;
  custom_dir: string;
  relationships_dir: string;
}

export interface CustomizationSummary {
  base_path: string;
  has_customizations: boolean;
  providers: CustomizationFile[];
  overrides: CustomizationFile[];
  custom_resources: CustomizationFile[];
  relationships: CustomizationFile[];
}

export interface CustomizationFile {
  name: string;
  path: string;
  size: number;
  modified: Date;
}

export interface CustomizationValidation {
  valid: boolean;
  errors: CustomizationError[];
  warnings: ValidationWarning[];
}

export interface CustomizationError {
  file: string;
  message: string;
  line?: number;
}

export interface ValidationWarning {
  file: string;
  message: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CUSTOMIZATION_DIR = '.ice/schemas';
const PROVIDERS_SUBDIR = 'providers';
const OVERRIDES_SUBDIR = 'overrides';
const CUSTOM_SUBDIR = 'custom';
const RELATIONSHIPS_SUBDIR = 'relationships';

// ============================================================================
// Customization Loader
// ============================================================================

export class CustomizationLoader {
  private base_path: string;

  /**
   * Create a customization loader.
   * @param project_root The project root directory (defaults to cwd)
   */
  constructor(project_root?: string) {
    this.base_path = path.join(project_root ?? process.cwd(), DEFAULT_CUSTOMIZATION_DIR);
  }

  /**
   * Get the paths to all customization directories.
   */
  get_paths(): CustomizationPaths {
    return {
      providers_dir: path.join(this.base_path, PROVIDERS_SUBDIR),
      overrides_dir: path.join(this.base_path, OVERRIDES_SUBDIR),
      custom_dir: path.join(this.base_path, CUSTOM_SUBDIR),
      relationships_dir: path.join(this.base_path, RELATIONSHIPS_SUBDIR),
    };
  }

  /**
   * Check if customizations directory exists.
   */
  has_customizations(): boolean {
    return fs.existsSync(this.base_path);
  }

  /**
   * Scan for all customization files and return a summary.
   */
  scan(): CustomizationSummary {
    const paths = this.get_paths();

    return {
      base_path: this.base_path,
      has_customizations: this.has_customizations(),
      providers: this.scan_directory(paths.providers_dir, ['.json']),
      overrides: this.scan_directory(paths.overrides_dir, ['.yaml', '.yml']),
      custom_resources: this.scan_directory(paths.custom_dir, ['.yaml', '.yml']),
      relationships: this.scan_directory(paths.relationships_dir, ['.yaml', '.yml']),
    };
  }

  /**
   * Initialize the customization directory structure.
   */
  async initialize(): Promise<void> {
    const paths = this.get_paths();

    // Create all directories
    for (const dir of Object.values(paths)) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    // Create example files if directories are empty
    await this.create_example_files(paths);
  }

  /**
   * Validate all customization files.
   */
  async validate(): Promise<CustomizationValidation> {
    const errors: CustomizationError[] = [];
    const warnings: ValidationWarning[] = [];
    const summary = this.scan();

    // Validate providers
    for (const file of summary.providers) {
      const result = await this.validate_provider_file(file.path);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    // Validate overrides
    for (const file of summary.overrides) {
      const result = await this.validate_override_file(file.path);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    // Validate custom resources
    for (const file of summary.custom_resources) {
      const result = await this.validate_custom_resource_file(file.path);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    // Validate relationships
    for (const file of summary.relationships) {
      const result = await this.validate_relationships_file(file.path);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get the path to the project schema database.
   */
  get_project_db_path(): string {
    return path.join(path.dirname(this.base_path), 'schemas.db');
  }

  /**
   * Check if project schema database exists.
   */
  has_project_db(): boolean {
    return fs.existsSync(this.get_project_db_path());
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private scan_directory(dir: string, extensions: string[]): CustomizationFile[] {
    if (!fs.existsSync(dir)) {
      return [];
    }

    const files: CustomizationFile[] = [];

    try {
      const entries = fs.readdirSync(dir);

      for (const entry of entries) {
        const ext = path.extname(entry).toLowerCase();
        if (!extensions.includes(ext)) {
          continue;
        }

        const file_path = path.join(dir, entry);
        const stats = fs.statSync(file_path);

        if (stats.isFile()) {
          files.push({
            name: entry,
            path: file_path,
            size: stats.size,
            modified: stats.mtime,
          });
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return files;
  }

  private async create_example_files(paths: CustomizationPaths): Promise<void> {
    // Example provider
    const provider_example = path.join(paths.providers_dir, '_example.json.disabled');
    if (!fs.existsSync(provider_example)) {
      const content = JSON.stringify(
        {
          _comment: 'Remove .disabled extension to enable this file',
          source: 'custom',
          provider_name: 'mycompany/internal',
          version: '1.0.0',
          resources: {
            mycompany_api_endpoint: {
              description: 'Internal API endpoint',
              category: 'compute',
              properties: {
                name: { type: 'string', required: true },
                url: { type: 'string', required: true },
                auth_type: { type: 'string', enum: ['oauth', 'apikey', 'none'] },
              },
            },
          },
        },
        null,
        2,
      );
      fs.writeFileSync(provider_example, content);
    }

    // Example override
    const override_example = path.join(paths.overrides_dir, '_example.yaml.disabled');
    if (!fs.existsSync(override_example)) {
      const content = `# Remove .disabled extension to enable this file
# This example shows how to override an existing resource type
ice_type: aws.ec2.instance
overrides:
  display_name: "Custom EC2 Name"
  icon: "server-custom"
  description: |
    Our standard EC2 instance configuration.
    Must use approved AMIs only.

  # Restrict allowed values for a property
  properties:
    instance_type:
      allowed_values: ["t3.micro", "t3.small", "t3.medium"]
      description: "Only t3 instances allowed per policy"

  # Add custom relationships
  relationships:
    - target: mycompany.monitoring.agent
      type: depends_on
      description: "All instances must have monitoring agent"
`;
      fs.writeFileSync(override_example, content);
    }

    // Example custom resource
    const custom_example = path.join(paths.custom_dir, '_example.yaml.disabled');
    if (!fs.existsSync(custom_example)) {
      const content = `# Remove .disabled extension to enable this file
# This example shows how to define a custom resource type
ice_type: mycompany.api.gateway
display_name: "API Gateway"
category: application
icon: gateway
description: "Internal API Gateway for microservices"

properties:
  name:
    type: string
    required: true
    description: "Gateway name"

  endpoints:
    type: array
    description: "List of API endpoints"

relationships:
  - target: aws.ec2.instance
    type: connects_to
    property: backend_url
    description: "Gateway connects to backend instances"
`;
      fs.writeFileSync(custom_example, content);
    }

    // Example relationships
    const relationships_example = path.join(paths.relationships_dir, '_example.yaml.disabled');
    if (!fs.existsSync(relationships_example)) {
      const content = `# Remove .disabled extension to enable this file
# This example shows how to add custom relationships between resource types
relationships:
  - source: aws.lambda.function
    target: mycompany.secrets.vault
    type: depends_on
    description: "All lambdas must use our secrets vault"

  - source: aws.ec2.instance
    target: aws.ec2.instance
    type: equivalent_to
    condition: "same availability zone"
`;
      fs.writeFileSync(relationships_example, content);
    }
  }

  private async validate_provider_file(
    file_path: string,
  ): Promise<{ errors: CustomizationError[]; warnings: ValidationWarning[] }> {
    const errors: CustomizationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      const content = fs.readFileSync(file_path, 'utf-8');
      const data = JSON.parse(content);

      if (!data.provider_name) {
        errors.push({ file: file_path, message: 'Missing required field: provider_name' });
      }

      if (!data.resources || typeof data.resources !== 'object') {
        errors.push({ file: file_path, message: 'Missing or invalid field: resources' });
      } else {
        for (const [name, resource] of Object.entries(data.resources)) {
          const res = resource as Record<string, unknown>;
          if (!res.properties || typeof res.properties !== 'object') {
            warnings.push({
              file: file_path,
              message: `Resource "${name}" has no properties defined`,
            });
          }
        }
      }
    } catch (error) {
      errors.push({
        file: file_path,
        message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return { errors, warnings };
  }

  private async validate_override_file(
    file_path: string,
  ): Promise<{ errors: CustomizationError[]; warnings: ValidationWarning[] }> {
    const errors: CustomizationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      const yaml = await import('yaml');
      const content = fs.readFileSync(file_path, 'utf-8');
      const data = yaml.parse(content);

      if (!data.ice_type) {
        errors.push({ file: file_path, message: 'Missing required field: ice_type' });
      }

      if (!data.overrides || typeof data.overrides !== 'object') {
        errors.push({ file: file_path, message: 'Missing or invalid field: overrides' });
      }
    } catch (error) {
      errors.push({
        file: file_path,
        message: `Invalid YAML: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return { errors, warnings };
  }

  private async validate_custom_resource_file(
    file_path: string,
  ): Promise<{ errors: CustomizationError[]; warnings: ValidationWarning[] }> {
    const errors: CustomizationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      const yaml = await import('yaml');
      const content = fs.readFileSync(file_path, 'utf-8');
      const data = yaml.parse(content);

      if (!data.ice_type) {
        errors.push({ file: file_path, message: 'Missing required field: ice_type' });
      }

      if (!data.display_name) {
        errors.push({ file: file_path, message: 'Missing required field: display_name' });
      }

      if (!data.category) {
        errors.push({ file: file_path, message: 'Missing required field: category' });
      }

      if (!data.properties || typeof data.properties !== 'object') {
        warnings.push({ file: file_path, message: 'No properties defined' });
      }
    } catch (error) {
      errors.push({
        file: file_path,
        message: `Invalid YAML: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return { errors, warnings };
  }

  private async validate_relationships_file(
    file_path: string,
  ): Promise<{ errors: CustomizationError[]; warnings: ValidationWarning[] }> {
    const errors: CustomizationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      const yaml = await import('yaml');
      const content = fs.readFileSync(file_path, 'utf-8');
      const data = yaml.parse(content);

      if (!data.relationships || !Array.isArray(data.relationships)) {
        errors.push({
          file: file_path,
          message: 'Missing or invalid field: relationships (must be array)',
        });
      } else {
        for (let i = 0; i < data.relationships.length; i++) {
          const rel = data.relationships[i];
          if (!rel.source) {
            errors.push({
              file: file_path,
              message: `Relationship ${i + 1}: missing required field: source`,
            });
          }
          if (!rel.target) {
            errors.push({
              file: file_path,
              message: `Relationship ${i + 1}: missing required field: target`,
            });
          }
          if (!rel.type) {
            errors.push({
              file: file_path,
              message: `Relationship ${i + 1}: missing required field: type`,
            });
          }
        }
      }
    } catch (error) {
      errors.push({
        file: file_path,
        message: `Invalid YAML: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return { errors, warnings };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a customization loader for the current project.
 */
export function create_customization_loader(project_root?: string): CustomizationLoader {
  return new CustomizationLoader(project_root);
}

/**
 * Get the bundled base database path.
 */
export function get_base_db_path(): string {
  // Try to find the base database from the schemas package
  const possible_paths = [
    // In development (relative to packages/core)
    path.join(__dirname, '..', '..', '..', '..', 'schemas', 'data', 'ice-schemas.db'),
    // When installed as a package
    require.resolve('@ice-engine/schemas/data/ice-schemas.db').replace('/index.js', '/data/ice-schemas.db'),
  ];

  for (const p of possible_paths) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch {
      // Continue to next path
    }
  }

  // Default path (may not exist)
  return path.join(__dirname, '..', '..', '..', '..', 'schemas', 'data', 'ice-schemas.db');
}
