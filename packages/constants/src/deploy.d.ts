/**
 * Deploy Constants
 *
 * Shared defaults for deploy/destroy flows. Imported by both the gateway
 * services and the UI so a fallback like "no provider on record →
 * assume GCP" is defined in one place rather than re-inlined at every
 * call site.
 */
import type { Provider } from './providers.js';
export declare const DEFAULT_PROVIDER: Provider;
export declare const DEFAULT_REGION = "us-central1";
export declare const DEFAULT_ENVIRONMENT = "development";
/**
 * Provider used purely for visual fallbacks (icon, service name, brand
 * color) when a node hasn't picked one yet. Distinct from
 * `DEFAULT_PROVIDER` (which drives deploy logic) because the canvas has
 * always shown AWS visuals as the neutral display state, while the
 * deploy pipeline assumes GCP when no credential is selected.
 */
export declare const DEFAULT_DISPLAY_PROVIDER: Provider;
/** Default git branch used when a node hasn't been wired to a specific one yet. */
export declare const DEFAULT_BRANCH = "main";
/**
 * Pipeline target environment when the user hasn't picked one. Matches the
 * existing pipeline-panel default — keep `production` here even though
 * deploy/destroy default to `development`. They serve different purposes:
 * pipeline triggers run "production by default unless overridden", while
 * a fresh deploy targets the dev env.
 */
export declare const DEFAULT_PIPELINE_ENVIRONMENT = "production";
export type DeployActionType = 'plan' | 'apply' | 'rollback' | 'destroy';
export type DeployRowStatus = 'planning' | 'deploying' | 'success' | 'partial' | 'failed' | 'cancelled';
/** Action types that flip a card's "current state" — used by hydrate to find the latest meaningful row. */
export declare const TERMINAL_DEPLOY_ACTIONS: DeployActionType[];
/** Statuses that mean a deploy/destroy is finished (no more events expected). */
export declare const TERMINAL_DEPLOY_STATUSES: DeployRowStatus[];
/**
 * User-facing label per action_type — used in the deploy history panel.
 * Keyed by `string` so callers who hold a raw DB value don't have to cast.
 */
export declare const DEPLOY_ACTION_LABELS: Record<string, string>;
/**
 * Tailwind color classes per action type — `text-* bg-*` pair used by the
 * deploy-history rows. Kept here (not in `colors.ts`) because they're
 * class strings consumed via `className`, not hex values.
 */
export declare const DEPLOY_ACTION_COLOR_CLASSES: Record<string, string>;
