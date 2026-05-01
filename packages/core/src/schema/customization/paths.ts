/**
 * Customization directory layout — types and constants.
 *
 * Extracted from `customization-loader.ts` (rf-cload-1) so example-files
 * and validators can import the path types without dragging in the
 * orchestrator. The orchestrator file `customization-loader.ts` re-exports
 * the types so external consumers' import paths are unchanged.
 */

export interface CustomizationPaths {
  providers_dir: string;
  overrides_dir: string;
  custom_dir: string;
  relationships_dir: string;
}

export const DEFAULT_CUSTOMIZATION_DIR = '.ice/schemas';
export const PROVIDERS_SUBDIR = 'providers';
export const OVERRIDES_SUBDIR = 'overrides';
export const CUSTOM_SUBDIR = 'custom';
export const RELATIONSHIPS_SUBDIR = 'relationships';
