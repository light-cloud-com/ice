/**
 * Auth Routes
 *
 * POST /api/auth/register — Create account
 * POST /api/auth/login — Login
 * POST /api/auth/refresh — Refresh JWT
 * POST /api/auth/logout — Clear refresh token
 * GET  /api/auth/me — Get current user
 */

import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { requireAuth, type AuthRequest } from '@ice/shared';
import * as authService from '../services/auth.service';
import { AuthError } from '../services/auth.service';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'test' ? 'test-secret' : (() => { throw new Error('JWT_SECRET is required'); })());

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

// ── Register ─────────────────────────────────────────────────────────────────

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;
    const result = await authService.registerUser(name, email, password);
    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);
    res.json({ token: result.token, user: result.user });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error('Register error:', err.message, err.stack);
    res.status(500).json({ message: 'Registration failed', error: err.message });
  }
});

// ── Login ────────────────────────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await authService.loginUser(email, password);
    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);
    res.json({ token: result.token, user: result.user });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login failed' });
  }
});

// ── Google Token Login (GIS implicit flow — no redirect URI needed) ──────────

router.post('/google/token', async (req: Request, res: Response) => {
  try {
    const { access_token } = req.body;
    if (!access_token) {
      return res.status(400).json({ message: 'Missing access token' });
    }

    // Validate token audience matches our client ID to prevent token confusion attacks
    const tokenInfoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(access_token)}`,
    );
    if (!tokenInfoRes.ok) {
      return res.status(401).json({ message: 'Invalid Google access token' });
    }
    const tokenInfo = await tokenInfoRes.json() as { aud?: string; azp?: string };

    const expectedClientId = process.env.GOOGLE_CLIENT_ID;
    if (expectedClientId && tokenInfo.aud !== expectedClientId && tokenInfo.azp !== expectedClientId) {
      return res.status(401).json({ message: 'Token audience mismatch — token was not issued for this application' });
    }

    // Fetch user profile
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!userInfoRes.ok) {
      return res.status(401).json({ message: 'Failed to fetch Google user info' });
    }
    const profile = await userInfoRes.json() as {
      email: string;
      name: string;
      picture?: string;
    };

    if (!profile.email) {
      return res.status(400).json({ message: 'Could not get email from Google' });
    }

    // Find or create user
    const user = await authService.findOrCreateOAuthUser(
      profile.email,
      profile.name || 'Google User',
      profile.picture || null,
    );

    // Generate JWT tokens
    const orgId = user.organisation_id || '';
    const token = jwt.sign({ userId: user.id, organisationId: orgId }, JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ userId: user.id, organisationId: orgId, type: 'refresh' }, JWT_SECRET, { expiresIn: '30d' });

    const prisma = (await import('@ice/db')).default;
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        user_id: user.id,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar } });
  } catch (err: any) {
    console.error('Google token login error:', err);
    res.status(500).json({ message: 'Google login failed' });
  }
});

// ── Refresh ──────────────────────────────────────────────────────────────────

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshTokenValue = req.cookies?.refreshToken;
    if (!refreshTokenValue) {
      return res.status(401).json({ message: 'No refresh token' });
    }

    const payload = jwt.verify(refreshTokenValue, JWT_SECRET) as {
      userId: string;
      organisationId: string;
      type?: string;
    };
    const result = await authService.refreshToken(refreshTokenValue, payload);

    // Set the new rotated refresh token cookie
    res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);
    res.json({ token: result.accessToken });
  } catch (err: any) {
    if (err instanceof AuthError) {
      res.clearCookie('refreshToken');
      return res.status(err.status).json({ message: err.message });
    }
    res.clearCookie('refreshToken');
    res.status(401).json({ message: 'Invalid refresh token' });
  }
});

// ── Logout ───────────────────────────────────────────────────────────────────

router.post('/logout', async (req: Request, res: Response) => {
  await authService.logoutUser(req.cookies?.refreshToken);
  res.clearCookie('refreshToken');
  res.json({ success: true });
});

// ── Me ───────────────────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const profile = await authService.getProfile(req.userId!);
    res.json(profile);
  } catch (err: any) {
    if (err instanceof AuthError) {
      return res.status(err.status).json({ message: err.message });
    }
    res.status(500).json({ message: 'Failed to get profile' });
  }
});

export default router;
