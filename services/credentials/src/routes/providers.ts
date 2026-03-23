/**
 * Provider Credential Routes — Thin handlers delegating to provider.service.ts
 *
 * Includes GCP OAuth via Google Identity Services (client-side code flow).
 */

import { requireAuth, requireOrgRole, type AuthRequest } from '@ice/shared';
import { Router, type Router as RouterType, type Response } from 'express';
import * as providerService from '../services/provider.service';

const router: RouterType = Router();
router.use(requireAuth);

// ── GCP OAuth — Code exchange (GIS authorization code flow) ──────────────
// Frontend uses initCodeClient (popup) → gets auth code → sends here.
// We exchange for access_token + refresh_token using redirect_uri: 'postmessage'.
// This flow goes through RAPT challenge (required by Google Workspace).

router.post('/gcp/oauth/exchange', requireOrgRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, error: 'Missing authorization code' });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).json({ success: false, error: 'Google OAuth not configured' });
    }

    // Exchange code for tokens — 'postmessage' is the redirect_uri for GIS popup flow
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: 'postmessage',
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('GCP OAuth token exchange failed:', errBody);
      return res.status(400).json({ success: false, error: 'Failed to exchange authorization code' });
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    if (!tokens.access_token) {
      return res.status(400).json({ success: false, error: 'No access token received' });
    }

    // Fetch user email + first project
    let projectId: string | undefined;
    let userEmail: string | undefined;
    try {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (userInfoRes.ok) {
        const info = (await userInfoRes.json()) as { email?: string };
        userEmail = info.email;
      }

      const projectsRes = await fetch(
        'https://cloudresourcemanager.googleapis.com/v1/projects?pageSize=1&filter=lifecycleState:ACTIVE',
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );
      if (projectsRes.ok) {
        const data = (await projectsRes.json()) as { projects?: Array<{ projectId: string }> };
        projectId = data.projects?.[0]?.projectId;
      }
    } catch {
      // Non-fatal
    }

    // Store OAuth credentials with refresh token (encrypted)
    await providerService.connectProvider(req.organisationId!, 'gcp', {
      _auth_type: 'oauth',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || '',
      token_expiry: String(Date.now() + tokens.expires_in * 1000),
      user_email: userEmail || '',
      project_id: projectId || '',
    });

    res.json({
      success: true,
      project_id: projectId,
      user_email: userEmail,
    });
  } catch (err: any) {
    console.error('GCP OAuth exchange error:', err);
    res.status(500).json({ success: false, error: err.message || 'OAuth failed' });
  }
});

// ── Standard provider routes ─────────────────────────────────────────────

router.get('/:provider/credentials', async (req: AuthRequest, res: Response) => {
  const provider = req.params.provider as string;
  const result = await providerService.getCredentials(req.organisationId!, provider);
  if (provider === 'gcp') {
    const authType = await providerService.getGCPAuthType(req.organisationId!);
    (result as any).auth_type = authType;
  }
  res.json(result);
});

router.post('/:provider/credentials', requireOrgRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const provider = req.params.provider as string;
    const result = await providerService.saveCredentials(req.organisationId!, provider, req.body.credentials);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:provider/status', async (req: AuthRequest, res: Response) => {
  const provider = req.params.provider as string;
  const result = await providerService.getCredentialStatus(req.organisationId!, provider);
  if (provider === 'gcp') {
    const authType = await providerService.getGCPAuthType(req.organisationId!);
    (result as any).auth_type = authType;
  }
  res.json(result);
});

router.post('/:provider/connect', requireOrgRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  try {
    const provider = req.params.provider as string;
    const result = await providerService.connectProvider(req.organisationId!, provider, req.body.credentials);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/:provider/disconnect', requireOrgRole('owner', 'admin'), async (req: AuthRequest, res: Response) => {
  const provider = req.params.provider as string;
  await providerService.disconnectProvider(req.organisationId!, provider);
  res.json({ success: true });
});

router.get('/:provider/projects', async (req: AuthRequest, res: Response) => {
  try {
    const projects = await providerService.listGCPProjects(req.organisationId!);
    res.json(projects);
  } catch {
    res.json([]);
  }
});

router.post('/:provider/import', async (_req: AuthRequest, res: Response) => {
  res.json({ success: false, error: 'Import not yet implemented for web version' });
});

export default router;
