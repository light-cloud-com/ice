/**
 * OAuth Routes — Google + GitHub login
 *
 * GET /api/auth/google          — Initiate Google OAuth
 * GET /api/auth/google/callback — Google callback → redirect with JWT
 * GET /api/auth/github          — Initiate GitHub OAuth
 * GET /api/auth/github/callback — GitHub callback → redirect with JWT
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import passport from 'passport';
import { generateToken, generateRefreshToken } from '@ice/shared';
import prisma from '@ice/db';

const router = Router();

const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((u) => u.trim());

function getFrontendUrl(req?: Request): string {
  // Try to redirect back to the origin the user came from
  if (req) {
    const referer = req.headers.referer || req.headers.origin;
    if (referer) {
      try {
        const origin = new URL(referer as string).origin;
        if (ALLOWED_ORIGINS.includes(origin)) return origin;
      } catch {}
    }
  }
  return ALLOWED_ORIGINS[0];
}

async function redirectWithToken(res: Response, user: any, req?: Request) {
  const orgId = user.organisation_id || '';
  const accessToken = generateToken(user.id, orgId);
  const refreshToken = generateRefreshToken(user.id, orgId);

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      user_id: user.id,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  res.redirect(`${getFrontendUrl(req)}/auth/callback#token=${accessToken}`);
}

function redirectWithError(res: Response, error: string, req?: Request) {
  res.redirect(`${getFrontendUrl(req)}/auth/callback?error=${encodeURIComponent(error)}`);
}

// ── Google ────────────────────────────────────────────────────────────────

router.get('/google', (req: Request, res: Response, next: NextFunction) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return redirectWithError(res, 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.', req);
  }
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

router.get('/google/callback', (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('google', { session: false }, async (err: Error | null, user: any) => {
    if (err || !user) {
      console.error('Google OAuth error:', err);
      return redirectWithError(res, err?.message || 'Authentication failed', req);
    }
    return await redirectWithToken(res, user, req);
  })(req, res, next);
});

// ── GitHub ────────────────────────────────────────────────────────────────

router.get('/github', (req: Request, res: Response, next: NextFunction) => {
  if (!process.env.GITHUB_CLIENT_ID) {
    return redirectWithError(res, 'GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.', req);
  }
  passport.authenticate('github', { scope: ['user:email'], session: false })(req, res, next);
});

router.get('/github/callback', (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('github', { session: false }, async (err: Error | null, user: any) => {
    if (err || !user) {
      console.error('GitHub OAuth error:', err);
      return redirectWithError(res, err?.message || 'Authentication failed', req);
    }
    return await redirectWithToken(res, user, req);
  })(req, res, next);
});

export default router;
