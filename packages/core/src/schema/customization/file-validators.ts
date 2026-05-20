/**
 * Per-file validators for the four customization file types.
 *
 * Extracted from `CustomizationLoader.validate_*_file` (rf-cload-2). Each
 * helper takes a file path, reads the content from disk, parses it
 * (JSON or YAML), and returns `{ errors, warnings }`.
 *
 * Behaviour preserved verbatim:
 *  - JSON parse failures and YAML parse failures emit one error each
 *    with the formatted "Invalid JSON/YAML: <message>" prefix.
 *  - Provider files require `provider_name` and a `resources` map; each
 *    resource without a `properties` object emits a warning, not an error.
 *  - Override files require `ice_type` and `overrides`.
 *  - Custom resource files require `ice_type`, `display_name`, `category`;
 *    a missing `properties` object emits a warning.
 *  - Relationships files require an array `relationships`; each entry
 *    must have `source`, `target`, `type` (1-indexed in error messages).
 */
import * as fs from 'fs';

export interface CustomizationError {
  file: string;
  message: string;
  line?: number;
}

export interface ValidationWarning {
  file: string;
  message: string;
}

export interface FileValidationResult {
  errors: CustomizationError[];
  warnings: ValidationWarning[];
}

export async function validate_provider_file(file_path: string): Promise<FileValidationResult> {
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

export async function validate_override_file(file_path: string): Promise<FileValidationResult> {
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

export async function validate_custom_resource_file(file_path: string): Promise<FileValidationResult> {
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

export async function validate_relationships_file(file_path: string): Promise<FileValidationResult> {
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
