/**
 * Deploy Constants
 *
 * Shared defaults for deploy/destroy flows. Imported by both the gateway
 * services and the UI so a fallback like "no provider on record →
 * assume GCP" is defined in one place rather than re-inlined at every
 * call site.
 */
export const DEFAULT_PROVIDER = 'gcp';
export const DEFAULT_REGION = 'us-central1';
export const DEFAULT_ENVIRONMENT = 'development';
/**
 * Provider used purely for visual fallbacks (icon, service name, brand
 * color) when a node hasn't picked one yet. Distinct from
 * `DEFAULT_PROVIDER` (which drives deploy logic) because the canvas has
 * always shown AWS visuals as the neutral display state, while the
 * deploy pipeline assumes GCP when no credential is selected.
 */
export const DEFAULT_DISPLAY_PROVIDER = 'aws';
/** Default git branch used when a node hasn't been wired to a specific one yet. */
export const DEFAULT_BRANCH = 'main';
/**
 * Pipeline target environment when the user hasn't picked one. Matches the
 * existing pipeline-panel default — keep `production` here even though
 * deploy/destroy default to `development`. They serve different purposes:
 * pipeline triggers run "production by default unless overridden", while
 * a fresh deploy targets the dev env.
 */
export const DEFAULT_PIPELINE_ENVIRONMENT = 'production';
/** Action types that flip a card's "current state" — used by hydrate to find the latest meaningful row. */
export const TERMINAL_DEPLOY_ACTIONS = ['apply', 'rollback', 'destroy'];
/** Statuses that mean a deploy/destroy is finished (no more events expected). */
export const TERMINAL_DEPLOY_STATUSES = ['success', 'partial', 'failed', 'cancelled'];
/**
 * User-facing label per action_type — used in the deploy history panel.
 * Keyed by `string` so callers who hold a raw DB value don't have to cast.
 */
export const DEPLOY_ACTION_LABELS = {
    plan: 'Plan',
    apply: 'Deploy',
    destroy: 'Destroy',
    rollback: 'Rollback',
};
/**
 * Tailwind color classes per action type — `text-* bg-*` pair used by the
 * deploy-history rows. Kept here (not in `colors.ts`) because they're
 * class strings consumed via `className`, not hex values.
 */
export const DEPLOY_ACTION_COLOR_CLASSES = {
    plan: 'text-slate-400 bg-slate-950/30',
    apply: 'text-blue-400 bg-blue-950/30',
    destroy: 'text-orange-400 bg-orange-950/30',
    rollback: 'text-purple-400 bg-purple-950/30',
};
