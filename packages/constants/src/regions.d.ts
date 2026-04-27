/**
 * Region Constants
 *
 * Per-provider region lists. Two shapes:
 *   - `PROVIDER_REGIONS`: bare region codes, used by deploy-panel selectors
 *     where the label is the code itself.
 *   - `PROVIDER_REGION_LABELS`: region code → human label, used by the
 *     onboarding flow where the user picks a friendly "US East
 *     (N. Virginia)" instead of `us-east-1`.
 *
 * The two are kept in sync deliberately: every code in
 * `PROVIDER_REGIONS` should have a matching label in
 * `PROVIDER_REGION_LABELS`.
 */
/**
 * Keyed by provider id (string) rather than `Provider` so consumers that
 * pass a free-form string (e.g., the deploy panel's local `provider`
 * state) can index without a cast. Only `gcp`/`aws`/`azure` are
 * populated today; missing keys return undefined and the caller falls
 * back to a default.
 */
export declare const PROVIDER_REGIONS: Record<string, string[]>;
export declare const PROVIDER_REGION_LABELS: Record<string, Record<string, string>>;
/**
 * Default-region fallback ordering used by the onboarding region
 * suggester (picks best region by user timezone). Entry order matters.
 */
export declare const REGION_SUGGESTION_ORDER: Record<string, string[]>;
