/**
 * GCP Constants
 *
 * GCP-specific shared values: which APIs each iceType needs enabled,
 * which APIs to enable for every deploy, and the patterns we use to
 * recognize "API not yet enabled" errors. The deploy service uses these
 * for preflight enablement; the UI uses the patterns for surfacing a
 * helpful "click to enable" CTA on errors.
 */
/**
 * Always-enabled APIs for any GCP deployment. The deploy service unions
 * these with the per-iceType list before calling Service Usage.
 */
export declare const GCP_BASE_APIS: readonly string[];
/**
 * iceType → required GCP APIs. Every block type that hits a Google API
 * during deploy or preflight requirements MUST appear here, otherwise
 * the user sees a cryptic SERVICE_DISABLED error mid-deploy.
 */
export declare const GCP_ICE_TYPE_API_MAP: Record<string, readonly string[]>;
/**
 * Substring patterns that identify "this GCP API isn't enabled yet"
 * errors — used by the UI to attach an enable-CTA to the error banner.
 */
export declare const GCP_API_NOT_ENABLED_PATTERNS: readonly string[];
