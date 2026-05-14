/**
 * Import Error Classification System (rf-ierr shim)
 *
 * Re-export shim — types and the per-cloud classifiers were extracted
 * into separate modules under `import-errors/`:
 *
 *   - `import-errors/types.ts` — ImportErrorCode, ImportErrorAction,
 *     ImportError, ImportWarning
 *   - `import-errors/gcp.ts` — classifyGCPError
 *   - `import-errors/aws.ts` — classifyAWSError
 *   - `import-errors/azure.ts` — classifyAzureError
 *
 * The public API surface (consumed by `errors/index.ts`,
 * `aws-importer.ts`, `azure-importer.ts`, GCP services) is unchanged
 * — every name remains importable from `./import-errors.js`.
 *
 * rf-ierr-1/2/3/4 (P3 cohort 6).
 */

export {
  ImportErrorCode,
  type ImportErrorAction,
  type ImportErrorActionType,
  type ImportError,
  type ImportWarning,
} from './import-errors/types';

export { classifyGCPError } from './import-errors/gcp';
export { classifyAWSError } from './import-errors/aws';
export { classifyAzureError } from './import-errors/azure';
