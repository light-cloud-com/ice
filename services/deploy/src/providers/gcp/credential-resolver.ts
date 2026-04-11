/**
 * GCP credential resolver — extracts the OAuth2Client / GoogleAuth / SA
 * key block that was previously copy-pasted across applyDeployment,
 * destroyDeployment, destroyAllForCard, rollbackDeployment, and
 * checkDrift in `services/deploy/src/services/deploy.service.ts`.
 *
 * Writes any service-account key to a per-deploy temp directory with
 * mode 0700/0600 (see `writeTempCredentials` in deploy.service.ts for
 * the security posture) and returns the scoped auth bundle that every
 * handler, the API auto-enabler, and the orphan cleanup service need.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import * as providerService from '@ice/service-credentials';
import { registerTempDir, releaseTempDir } from '../../services/deploy-locks.js';
import type { CredentialResolver, ResolveAuthOptions, ScopedDeployAuth } from '../types.js';

/** Small SA-key sanity check — we'd rather throw now than mid-deploy. */
function validateSaKey(parsed: any): void {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Service account key is not a JSON object');
  }
  const required = ['type', 'project_id', 'private_key', 'client_email'];
  const missing = required.filter((k) => !parsed[k]);
  if (missing.length > 0) {
    throw new Error(`Service account key missing fields: ${missing.join(', ')}`);
  }
}

function writeTempCredentials(keyJson: string): { keyPath: string; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ice-deploy-'));
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // chmod is a no-op on some FSes; mkdtemp default is usually already 0700.
  }
  const keyPath = path.join(dir, 'sa.json');
  fs.writeFileSync(keyPath, keyJson, { mode: 0o600 });
  registerTempDir(dir);
  return { keyPath, dir };
}

export const gcpCredentialResolver: CredentialResolver = {
  provider: 'gcp',

  async resolve(options: ResolveAuthOptions): Promise<ScopedDeployAuth> {
    const { credentials, orgId, onLog, requestedScope } = options;
    if (!credentials) {
      throw new Error('Provider not connected. Please connect your cloud provider first.');
    }

    let authClient: any;
    let tempDir: string | undefined;
    let keyFilePath: string | undefined;
    let parsedCredentials: any;
    let accessToken: string | undefined;

    if (credentials._auth_type === 'oauth') {
      const token = await providerService.getValidGCPAccessToken(orgId, credentials);
      if (!token) {
        throw new Error(
          'GCP OAuth token expired. Please reconnect via Cloud Providers settings.\n' +
            'For Google Workspace accounts, we recommend using a Service Account Key instead.',
        );
      }
      const { OAuth2Client } = await import('google-auth-library');
      const oauthClient = new OAuth2Client();
      oauthClient.setCredentials({ access_token: token });
      authClient = oauthClient;
      accessToken = token;
      onLog?.('Authenticating via Google OAuth...');
    } else {
      const key = credentials.service_account_key || credentials.key;
      if (!key) {
        throw new Error('No GCP credentials available — connect a provider or supply a service account key.');
      }
      try {
        parsedCredentials = typeof key === 'string' ? JSON.parse(key) : key;
        validateSaKey(parsedCredentials);
        const { GoogleAuth } = await import('google-auth-library');
        const auth = new GoogleAuth({
          credentials: parsedCredentials,
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });
        authClient = await auth.getClient();

        const keyJson = typeof key === 'string' ? key : JSON.stringify(parsedCredentials);
        const { keyPath, dir } = writeTempCredentials(keyJson);
        tempDir = dir;
        keyFilePath = keyPath;
        (authClient as any)._ice_key_file_path = keyPath;
        (authClient as any)._ice_parsed_credentials = parsedCredentials;
        onLog?.('Authenticating via Service Account...');

        // Eagerly fetch an access token for API auto-enable + requirements.
        try {
          const tokenRes = await authClient.getAccessToken();
          accessToken = tokenRes?.token || tokenRes?.access_token || undefined;
        } catch {
          // Non-fatal — deploys can still work without a pre-fetched token.
        }
      } catch (err: any) {
        throw new Error(`Invalid service account key: ${err.message}`, { cause: err });
      }
    }

    const project =
      requestedScope?.project ||
      credentials.project_id ||
      parsedCredentials?.project_id ||
      (authClient as any)?.project_id;

    return {
      authClient,
      tempDir,
      keyFilePath,
      parsedCredentials,
      accessToken,
      scope: {
        provider: 'gcp',
        project,
        region: requestedScope?.region,
      },
    };
  },

  async cleanup(auth: ScopedDeployAuth): Promise<void> {
    if (auth.tempDir) {
      releaseTempDir(auth.tempDir);
    }
  },
};
