/**
 * Schema Customization Loader
 *
 * Loads user schema customizations from the .ice/schemas/ directory.
 * This loader scans for custom providers, overrides, custom resources,
 * and custom relationships that can be merged with the base schema database.
 */

import * as fs from 'fs';
import * as path from 'path';
import { get_base_db_path as resolve_base_db_path } from './customization/base-db.js';
import { create_example_files } from './customization/example-files.js';
import {
  validate_custom_resource_file,
  validate_override_file,
  validate_provider_file,
  validate_relationships_file,
} from './customization/file-validators.js';
import {
  CUSTOM_SUBDIR,
  DEFAULT_CUSTOMIZATION_DIR,
  OVERRIDES_SUBDIR,
  PROVIDERS_SUBDIR,
  RELATIONSHIPS_SUBDIR,
} from './customization/paths.js';
import { scan_directory } from './customization/scanner.js';

// ============================================================================
// Types (re-exported from customization/* so external consumers continue
// importing them from this shim).
// ============================================================================

export type { CustomizationPaths } from './customization/paths.js';
import type { CustomizationPaths } from './customization/paths.js';
export type { CustomizationError, ValidationWarning } from './customization/file-validators.js';
import type {
  CustomizationError,
  ValidationWarning,
} from './customization/file-validators.js';
export type { CustomizationFile } from './customization/scanner.js';
import type { CustomizationFile } from './customization/scanner.js';

export interface CustomizationSummary {
  base_path: string;
  has_customizations: boolean;
  providers: CustomizationFile[];
  overrides: CustomizationFile[];
  custom_resources: CustomizationFile[];
  relationships: CustomizationFile[];
}

export interface CustomizationValidation {
  valid: boolean;
  errors: CustomizationError[];
  warnings: ValidationWarning[];
}

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
      providers: scan_directory(paths.providers_dir, ['.json']),
      overrides: scan_directory(paths.overrides_dir, ['.yaml', '.yml']),
      custom_resources: scan_directory(paths.custom_dir, ['.yaml', '.yml']),
      relationships: scan_directory(paths.relationships_dir, ['.yaml', '.yml']),
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
    await create_example_files(paths);
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
      const result = await validate_provider_file(file.path);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    // Validate overrides
    for (const file of summary.overrides) {
      const result = await validate_override_file(file.path);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    // Validate custom resources
    for (const file of summary.custom_resources) {
      const result = await validate_custom_resource_file(file.path);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    // Validate relationships
    for (const file of summary.relationships) {
      const result = await validate_relationships_file(file.path);
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
 *
 * Re-exports the implementation from `customization/base-db.js`. Kept on
 * the orchestrator file so external `import { get_base_db_path } from
 * '@ice/core/schema/customization-loader'` callers are unaffected.
 */
export function get_base_db_path(): string {
  return resolve_base_db_path();
}
