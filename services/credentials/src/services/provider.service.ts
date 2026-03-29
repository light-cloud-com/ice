/**
 * Provider Service — Cloud provider credential management with encryption
 *
 * Extracted from routes/providers.ts + encryption from lib/crypto.ts
 */

import prisma from '@ice/db';
import { encryptCredentials, decryptCredentials } from '@ice/shared';

export async function getCredentialStatus(orgId: string, provider: string) {
  const cred = await prisma.providerCredential.findUnique({
    where: { organisation_id_provider: { organisation_id: orgId, provider } },
  });
  if (!cred) return { connected: false };
  return { connected: cred.is_connected, provider: cred.provider, project_id: cred.project_id };
}

export async function getCredentials(orgId: string, provider: string) {
  const cred = await prisma.providerCredential.findUnique({
    where: { organisation_id_provider: { organisation_id: orgId, provider } },
  });
  if (!cred) return {};
  // Return metadata only — never return raw credentials to routes
  return { provider: cred.provider, project_id: cred.project_id, is_connected: cred.is_connected };
}

export async function getDecryptedCredentials(orgId: string, provider: string): Promise<Record<string, string> | null> {
  const cred = await prisma.providerCredential.findUnique({
    where: { organisation_id_provider: { organisation_id: orgId, provider } },
  });
  if (!cred || !cred.is_connected) return null;

  try {
    return decryptCredentials(cred.credentials);
  } catch {
    // If decryption fails (old plaintext data), try JSON.parse
    try {
      return JSON.parse(cred.credentials);
    } catch {
      return null;
    }
  }
}

export async function connectProvider(orgId: string, provider: string, credentials: Record<string, string>) {
  // Validate credentials for GCP
  let projectId: string | undefined;
  if (provider === 'gcp' && credentials._auth_type !== 'oauth') {
    // Service account key flow — validate the key
    const validation = await validateGCPCredentials(credentials);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid GCP credentials');
    }
    projectId = validation.projectId || credentials.project_id;
  } else if (provider === 'gcp' && credentials._auth_type === 'oauth') {
    // OAuth flow — tokens already validated during exchange
    projectId = credentials.project_id;
  }

  const encrypted = encryptCredentials(credentials);

  const cred = await prisma.providerCredential.upsert({
    where: { organisation_id_provider: { organisation_id: orgId, provider } },
    update: {
      credentials: encrypted,
      is_connected: true,
      project_id: projectId || credentials.project_id || null,
    },
    create: {
      organisation_id: orgId,
      provider,
      credentials: encrypted,
      is_connected: true,
      project_id: projectId || credentials.project_id || null,
    },
  });

  return { success: true, id: cred.id, project_id: projectId };
}

export async function saveCredentials(orgId: string, provider: string, credentials: Record<string, string>) {
  const encrypted = encryptCredentials(credentials);

  const cred = await prisma.providerCredential.upsert({
    where: { organisation_id_provider: { organisation_id: orgId, provider } },
    update: { credentials: encrypted },
    create: { organisation_id: orgId, provider, credentials: encrypted },
  });

  return { success: true, id: cred.id };
}

export async function disconnectProvider(orgId: string, provider: string) {
  await prisma.providerCredential.updateMany({
    where: { organisation_id: orgId, provider },
    data: { is_connected: false, credentials: '' },
  });
}

async function validateGCPCredentials(
  credentials: Record<string, string>,
): Promise<{ valid: boolean; error?: string; projectId?: string }> {
  try {
    // If it's a service account key JSON, parse and validate structure
    const key = credentials.service_account_key || credentials.key;
    if (key) {
      let parsed: any;
      try {
        parsed = typeof key === 'string' ? JSON.parse(key) : key;
      } catch {
        return { valid: false, error: 'Invalid JSON in service account key' };
      }

      if (!parsed.client_email || !parsed.private_key) {
        return { valid: false, error: 'Service account key must contain client_email and private_key' };
      }

      // Try live auth, but accept the key even if GCP is unreachable
      try {
        // @ts-ignore — available via @ice/core dependency
        const { GoogleAuth } = await import('google-auth-library');
        const auth = new GoogleAuth({
          credentials: parsed,
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });
        const client = await auth.getClient();
        await client.getAccessToken();
      } catch (err: any) {
        // Log but don't fail — key structure is valid, auth may fail due to network/permissions
        console.warn('GCP live validation warning (connecting anyway):', err.message);
      }
      return { valid: true, projectId: parsed.project_id };
    }

    return { valid: false, error: 'No service account key provided' };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

export async function listGCPProjects(orgId: string): Promise<Array<{ id: string; name: string }>> {
  const creds = await getDecryptedCredentials(orgId, 'gcp');
  if (!creds) return [];

  // OAuth flow — use access token to list projects
  if (creds._auth_type === 'oauth') {
    const accessToken = await getValidGCPAccessToken(orgId, creds);
    if (!accessToken) return creds.project_id ? [{ id: creds.project_id, name: creds.project_id }] : [];

    try {
      const res = await fetch('https://cloudresourcemanager.googleapis.com/v1/projects?filter=lifecycleState:ACTIVE', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { projects?: Array<{ projectId: string; name: string }> };
        return (data.projects || []).map((p) => ({ id: p.projectId, name: p.name || p.projectId }));
      }
    } catch {
      // Fall through to static project
    }
    return creds.project_id ? [{ id: creds.project_id, name: creds.project_id }] : [];
  }

  // Service account key flow
  const key = creds.service_account_key || creds.key;
  if (key) {
    try {
      const parsed = typeof key === 'string' ? JSON.parse(key) : key;
      if (parsed.project_id) {
        return [{ id: parsed.project_id, name: parsed.project_id }];
      }
    } catch {
      // ignore
    }
  }

  return [];
}

/**
 * Get a valid GCP access token, refreshing if expired.
 * For OAuth-connected GCP credentials only.
 */
export async function getValidGCPAccessToken(
  orgId: string,
  creds?: Record<string, string> | null,
): Promise<string | null> {
  if (!creds) {
    creds = await getDecryptedCredentials(orgId, 'gcp');
  }
  if (!creds || creds._auth_type !== 'oauth') return null;

  const expiry = parseInt(creds.token_expiry || '0', 10);
  const isExpired = Date.now() > expiry - 60_000; // 1min buffer

  if (!isExpired && creds.access_token) {
    return creds.access_token;
  }

  // Refresh the token
  if (!creds.refresh_token) return null;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: creds.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      console.error('GCP token refresh failed:', await res.text());
      return null;
    }

    const tokens = (await res.json()) as { access_token: string; expires_in: number };

    // Update stored credentials with new access token
    const updatedCreds = {
      ...creds,
      access_token: tokens.access_token,
      token_expiry: String(Date.now() + tokens.expires_in * 1000),
    };

    const encrypted = encryptCredentials(updatedCreds);
    await prisma.providerCredential.updateMany({
      where: { organisation_id: orgId, provider: 'gcp' },
      data: { credentials: encrypted },
    });

    return tokens.access_token;
  } catch (err: any) {
    console.error('GCP token refresh error:', err.message);
    return null;
  }
}

/**
 * Get the auth type of the stored GCP credentials.
 */
export async function getGCPAuthType(orgId: string): Promise<'oauth' | 'service_account' | null> {
  const creds = await getDecryptedCredentials(orgId, 'gcp');
  if (!creds) return null;
  return creds._auth_type === 'oauth' ? 'oauth' : 'service_account';
}
