/**
 * Provider Constants
 *
 * Provider identifiers, types, and display metadata.
 */
export type Provider = 'aws' | 'gcp' | 'azure' | 'kubernetes' | 'alibaba' | 'oci' | 'digitalocean';
export declare const ALL_PROVIDERS: Provider[];
export declare const DEFAULT_TEMPLATE_PROVIDERS: Provider[];
export interface CloudProviderMeta {
    id: Provider;
    name: string;
    shortName: string;
    description: string;
    icon: string;
    color: string;
}
/**
 * Short display label per provider — used in deploy panel headers,
 * status banners, and integration dots. Includes `github` because it's
 * shown alongside cloud providers in the integration UI.
 */
export declare const PROVIDER_LABELS: Record<string, string>;
/**
 * "Project" / scope field metadata per provider — different clouds use
 * different terminology (GCP project, AWS account, Azure subscription).
 */
export declare const PROVIDER_PROJECT_LABELS: Record<string, {
    label: string;
    placeholder: string;
}>;
/**
 * Provider console URL bases — used to build "open in cloud console"
 * deep-links from a resource row. URLs include the trailing slash so
 * callers can append a path fragment without having to add it.
 */
export declare const PROVIDER_CONSOLE_BASE: Record<string, string>;
/**
 * OAuth scopes requested when connecting GCP via the browser code-flow.
 * Cloud-platform scope plus project listing — no openid/email/profile,
 * since the user has already authenticated to ICE separately.
 */
export declare const GCP_OAUTH_SCOPES: readonly string[];
export declare const CLOUD_PROVIDERS: CloudProviderMeta[];
