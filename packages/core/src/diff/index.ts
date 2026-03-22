/**
 * ICE Diff Module
 *
 * Compare desired state with current infrastructure and generate diffs.
 */

export { diff_graphs, format_plan } from './diff.js';

export type {
  ChangeType,
  DiffPropertyChange,
  ResourceChange,
  DiffSummary,
  DiffResult,
  DiffError,
  DiffWarning,
  DiffOptions,
} from './types.js';
