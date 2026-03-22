/**
 * GCP Authentication
 *
 * Supports three authentication strategies:
 * 1. ADC (Application Default Credentials) — gcloud auth application-default login
 * 2. Service Account key file — JSON key file path
 * 3. OAuth2 browser flow — for desktop users without gcloud
 */

import { load_sdk } from './sdk-loader.js';
import { AUTH_MESSAGES } from '../../messages.js';

// =============================================================================
// Types
// =============================================================================

export type GCPAuthMethod = 'adc' | 'service-account' | 'oauth';

export interface GCPAuthConfig {
  /** Authentication method */
  method: GCPAuthMethod;
  /** GCP project ID */
  project_id: string;
  /** Path to service account JSON key file (for 'service-account' method) */
  key_file_path?: string;
  /** OAuth2 credentials (for 'oauth' method) */
  oauth?: {
    client_id: string;
    client_secret: string;
    refresh_token: string;
  };
}

export interface GCPAuthResult {
  valid: boolean;
  email?: string;
  project_id?: string;
  error?: string;
}

export interface GCPProject {
  id: string;
  name: string;
  number: string;
}

// =============================================================================
// Authentication
// =============================================================================

/**
 * Get an authenticated GCP client based on the auth config.
 * Returns a google-auth-library client that can be passed to SDK constructors.
 */
export async function get_gcp_credentials(config: GCPAuthConfig): Promise<any> {
  const google_auth = await load_sdk('google-auth-library');
  if (!google_auth) {
    throw new Error(AUTH_MESSAGES.AUTH_LIB_NOT_INSTALLED_NPM);
  }

  switch (config.method) {
    case 'adc': {
      // Application Default Credentials — uses GOOGLE_APPLICATION_CREDENTIALS
      // or the credentials from `gcloud auth application-default login`
      const auth = new google_auth.GoogleAuth({
        scopes: [AUTH_MESSAGES.CLOUD_PLATFORM_SCOPE],
        projectId: config.project_id,
      });
      return auth.getClient();
    }

    case 'service-account': {
      if (!config.key_file_path) {
        throw new Error(AUTH_MESSAGES.SERVICE_ACCOUNT_KEY_REQUIRED);
      }
      const auth = new google_auth.GoogleAuth({
        keyFile: config.key_file_path,
        scopes: [AUTH_MESSAGES.CLOUD_PLATFORM_SCOPE],
        projectId: config.project_id,
      });
      return auth.getClient();
    }

    case 'oauth': {
      if (!config.oauth) {
        throw new Error(AUTH_MESSAGES.OAUTH_CREDENTIALS_REQUIRED);
      }
      const client = new google_auth.OAuth2Client(
        config.oauth.client_id,
        config.oauth.client_secret
      );
      client.setCredentials({ refresh_token: config.oauth.refresh_token });
      return client;
    }

    default:
      throw new Error(AUTH_MESSAGES.UNKNOWN_AUTH_METHOD(config.method));
  }
}

/**
 * Validate GCP credentials by making a test API call.
 */
export async function validate_gcp_credentials(config: GCPAuthConfig): Promise<GCPAuthResult> {
  try {
    const client = await get_gcp_credentials(config);

    // Test the credentials by requesting token info
    const token = await client.getAccessToken();
    if (!token?.token) {
      return { valid: false, error: AUTH_MESSAGES.COULD_NOT_OBTAIN_TOKEN };
    }

    // Try to get the user's email
    const google_auth = await load_sdk('google-auth-library');
    const auth = new google_auth.GoogleAuth({
      scopes: [AUTH_MESSAGES.CLOUD_PLATFORM_SCOPE],
      projectId: config.project_id,
    });
    const credentials = await auth.getCredentials();

    return {
      valid: true,
      email: credentials?.client_email || credentials?.universe_domain || 'authenticated',
      project_id: config.project_id,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * List accessible GCP projects.
 */
export async function list_gcp_projects(config: GCPAuthConfig): Promise<GCPProject[]> {
  try {
    const client = await get_gcp_credentials(config);

    const url =
      'https://cloudresourcemanager.googleapis.com/v1/projects?filter=lifecycleState%3AACTIVE';
    const response = await client.request({ url });
    const data = response.data as any;

    return (data.projects || []).map((p: any) => ({
      id: p.projectId,
      name: p.name,
      number: p.projectNumber,
    }));
  } catch (error) {
    return [];
  }
}
