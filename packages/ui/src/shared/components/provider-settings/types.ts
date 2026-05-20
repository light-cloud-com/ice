/**
 * Provider Settings — shared types.
 *
 * Extracted verbatim from `../provider-settings.tsx` as part of the rf-pset
 * series (mirroring the rf-pdpl / rf-rpal section pattern). These are the
 * load-bearing shapes the modal imports across handlers, sections, the
 * config-data array, and the orchestrator — keep the exports stable so the
 * orchestrator and section files can rely on a single source of truth.
 */

/** The cloud provider IDs configurable through the modal. The discriminated
 *  union is verbatim from the source — additions here ripple through
 *  `PROVIDER_CONFIGS`, the GCP-specific OAuth branch, and the per-provider
 *  expand/connect flow. */
export type ProviderId = 'aws' | 'gcp' | 'azure';

/** A single configuration field rendered in the provider's connect form.
 *  `helpLink` is optional and renders an external-link button next to the
 *  field's label (used today for GCP's service-account help link). */
export interface ConfigField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'textarea' | 'select';
  placeholder?: string;
  required: boolean;
  options?: string[];
  helpLink?: { url: string; text: string };
}

/** A provider entry in `PROVIDER_CONFIGS`. The `id` discriminates the union
 *  of the three supported providers, `configFields` drive the connect form,
 *  and the `color` / `bgColor` Tailwind classes drive the icon chip styling. */
export interface ProviderConfig {
  id: ProviderId;
  name: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
  configFields: ConfigField[];
}

/** A provider project surfaced once a connection succeeds. The `region` is
 *  optional because not all providers expose region metadata (AWS and Azure
 *  do; GCP project listings vary). */
export interface ProviderProject {
  id: string;
  name: string;
  region?: string;
}

/** Per-provider state tracked in the modal: connection flag, the list of
 *  discovered projects, and any in-progress form values (including the
 *  `new_*`-prefixed values for the GCP add-project sub-form). */
export interface ProviderRuntimeState {
  connected: boolean;
  projects: ProviderProject[];
  formValues: Record<string, string>;
}

/** The map keyed by `ProviderConfig.id` carrying the runtime state for each
 *  provider. The orchestrator owns this map; sections receive a slice via
 *  props. */
export type ProviderStatesMap = Record<string, ProviderRuntimeState>;

/** Public props for the `ProviderSettings` modal. `isOpen` toggles the
 *  portal mount; `onClose` is invoked from the X / Close buttons; the
 *  optional `onImportComplete` callback receives the imported graph from
 *  `getApi().provider.import(...)` and is used by the canvas to load the
 *  imported infrastructure. */
export interface ProviderSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  // The imported graph is provider-shaped JSON whose schema lives outside
  // this file. Preserved as `any` from the source to avoid widening the
  // implicit boundary contract.

  onImportComplete?: (graph: any) => void;
}
