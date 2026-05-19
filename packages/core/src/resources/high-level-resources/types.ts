/**
 * High-Level Resource type definitions.
 *
 * Extracted from `../high-level-resources.ts` (rf-hlres-1) so the categories
 * sub-modules can import these without pulling in the giant data tables.
 *
 * Public consumers should import from `../high-level-resources.js` (the shim)
 * — it re-exports every type defined here.
 */

import { type NodeBehavior } from '@ice/constants';

export type { NodeBehavior };

/**
 * Provider-specific implementation of a high-level resource
 */
export interface ProviderImplementation {
  provider: 'aws' | 'gcp' | 'azure' | 'kubernetes' | 'alibaba' | 'oci' | 'digitalocean';
  resource_type: string; // e.g., 'aws:s3:Bucket', 'gcp:storage:Bucket'
  display_name: string; // e.g., 'S3 Bucket', 'Cloud Storage Bucket'
}

export interface HighLevelResource {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  // Node behavior type
  behavior: NodeBehavior;
  // Which providers support this resource
  providers: Array<'aws' | 'gcp' | 'azure' | 'kubernetes' | 'alibaba' | 'oci' | 'digitalocean'>;
  // Provider-specific implementations
  implementations: ProviderImplementation[];
  // Keywords to match against low-level resources
  keywords: string[];
  // Common properties users care about
  properties: HighLevelProperty[];
}

/**
 * Rich option detail for select fields — replaces generic options with
 * real cloud values, descriptions, and per-provider filtering.
 */
export interface OptionDetail {
  /** Stored in node.data (e.g., "db.t3.micro") — the real cloud value */
  value: string;
  /** Display title (e.g., "db.t3.micro") */
  label: string;
  /** Subtitle (e.g., "2 vCPU · 1 GB RAM") */
  description?: string;
  /** Cost hint (e.g., "~$15/mo") */
  cost?: string;
  /** When set, only show for this provider (e.g., "aws", "gcp", "azure") */
  provider?: string;
  /** Detailed help text shown on hover */
  tooltip?: string;
}

export interface HighLevelProperty {
  name: string;
  label: string;
  /**
   * Property type drives the renderer in the properties panel.
   * - `string` / `number` / `boolean`: plain inputs
   * - `select`: dropdown or card picker (see optionDetails)
   * - `list`: generic string list with add/remove
   * - `queue_list`: bespoke queue renderer — each item shows as a queue pill
   *   with a distinct icon, FIFO badge, and queue-semantic affordances
   */
  type: 'string' | 'number' | 'boolean' | 'select' | 'list' | 'queue_list' | 'task_list';
  required: boolean;
  description: string;
  options?: string[];
  default?: unknown;
  /** Controls visibility in the properties panel */
  tier?: 'essential' | 'detailed' | 'advanced';
  /** Placeholder text for string/list inputs */
  placeholder?: string;
  /** For 'list' type: label for the add button (e.g. "Add queue") */
  addLabel?: string;
  /** Rich option details — when present, renders a card picker instead of a plain dropdown.
   *  Takes precedence over `options` for rendering. */
  optionDetails?: OptionDetail[];
  /** Detailed help text shown on hover (info icon next to label) */
  tooltip?: string;
  /** Configuration for the inline input shown when 'custom' option is selected.
   *  Requires a { value: 'custom', ... } entry in optionDetails. */
  customInput?: {
    /** Input field type */
    type: 'number' | 'string';
    /** Unit label displayed after the input (e.g., 'GB', 'MB', 'days') */
    unit: string;
    /** Minimum allowed value (number type only) */
    min?: number;
    /** Maximum allowed value (number type only) */
    max?: number;
    /** Step increment (number type only) */
    step?: number;
    /** Placeholder text for the input */
    placeholder?: string;
  };
  /** Conditional rendering — only show this property when another field on
   *  the same node matches a value (or one of a set of values). Used e.g.
   *  to reveal a cron-expression input only when `frequency === 'Custom'`.
   *  Compared against `nodeData[visibleWhen.field]` with string equality. */
  visibleWhen?: {
    field: string;
    equals: string | string[];
  };
}

export interface HighLevelCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  resources: HighLevelResource[];
}
