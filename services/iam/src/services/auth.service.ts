/**
 * Auth Service — Business logic for authentication
 *
 * Extracted from routes/auth.ts and routes/oauth.ts
 */

import bcrypt from 'bcryptjs';
import prisma from '@ice/db';
import { generateToken, generateRefreshToken } from '@ice/shared';

export interface AuthResult {
  token: string;
  refreshToken: string;
  user: { id: string; email: string; name: string; organisationId: string };
}

export async function registerUser(name: string, email: string, password: string): Promise<AuthResult> {
  if (!name || !email || !password) {
    throw new AuthError('Name, email, and password are required', 400);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AuthError('Email already registered', 409);
  }

  const password_hash = await bcrypt.hash(password, 10);

  const org = await prisma.organisation.create({
    data: { name: `${name}'s Org` },
  });

  const user = await prisma.user.create({
    data: { name, email, password_hash, organisation_id: org.id },
  });

  // Create membership as owner
  await prisma.organisationMember.create({
    data: { user_id: user.id, organisation_id: org.id, role: 'owner' },
  });

  const token = generateToken(user.id, org.id);
  const refreshToken = generateRefreshToken(user.id, org.id);

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      user_id: user.id,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  return {
    token,
    refreshToken,
    user: { id: user.id, email: user.email, name: user.name, organisationId: org.id },
  };
}

// Sentinel value stored for OAuth-only users — they cannot log in with a password
const OAUTH_ONLY_SENTINEL = '@@oauth-only@@';

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AuthError('Invalid credentials', 401);
  }

  // Block password login for OAuth-only accounts
  if (user.password_hash === OAUTH_ONLY_SENTINEL || user.password_hash === '') {
    throw new AuthError('This account uses social login. Please sign in with Google or GitHub.', 401);
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new AuthError('Invalid credentials', 401);
  }

  const orgId = user.organisation_id || '';
  const token = generateToken(user.id, orgId);
  const refreshToken = generateRefreshToken(user.id, orgId);

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      user_id: user.id,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  return {
    token,
    refreshToken,
    user: { id: user.id, email: user.email, name: user.name, organisationId: orgId },
  };
}

export async function refreshToken(
  token: string,
  payload: { userId: string; organisationId: string; type?: string },
): Promise<{ accessToken: string; refreshToken: string }> {
  // BE-4: Validate the token has type: 'refresh' to prevent access tokens being used
  if (payload.type !== 'refresh') {
    throw new AuthError('Invalid token type', 401);
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token } });
  if (!stored) {
    // BE-3: Reuse detection — if a token was already consumed (deleted), revoke all
    // tokens for this user as a precaution (token family compromise)
    await prisma.refreshToken.deleteMany({ where: { user_id: payload.userId } });
    throw new AuthError('Refresh token reuse detected — all sessions revoked', 401);
  }

  if (stored.expires_at < new Date()) {
    await prisma.refreshToken.delete({ where: { token } }).catch(() => {});
    throw new AuthError('Refresh token expired', 401);
  }

  // BE-3: Rotate — delete old token and issue a new one
  await prisma.refreshToken.delete({ where: { token } });

  const newAccessToken = generateToken(payload.userId, payload.organisationId);
  const newRefreshToken = generateRefreshToken(payload.userId, payload.organisationId);

  await prisma.refreshToken.create({
    data: {
      token: newRefreshToken,
      user_id: payload.userId,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function logoutUser(refreshTokenValue: string | undefined): Promise<void> {
  if (refreshTokenValue) {
    await prisma.refreshToken.deleteMany({ where: { token: refreshTokenValue } }).catch(() => {});
  }
}

export async function getProfile(userId: string) {
  // BE-9: Single query with includes instead of 2-3 sequential queries
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      organisation_id: true,
      onboarding_completed: true,
      onboarding_step: true,
      default_provider: true,
      default_region: true,
      memberships: {
        include: { organisation: { select: { id: true, name: true } } },
      },
      organisation: { select: { id: true, name: true } },
    },
  });
  if (!user) throw new AuthError('User not found', 404);

  const memberOrgIds = new Set(user.memberships.map((m) => m.organisation_id));
  const memberships = user.memberships.map((m) => ({
    id: m.organisation.id,
    name: m.organisation.name,
    role: m.role,
  }));

  // Include default org if user isn't explicitly a member (legacy data)
  if (user.organisation_id && !memberOrgIds.has(user.organisation_id) && user.organisation) {
    memberships.push({ id: user.organisation.id, name: user.organisation.name, role: 'owner' });
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    organisations: memberships,
    onboardingCompleted: user.onboarding_completed,
    onboardingStep: user.onboarding_step,
    defaultProvider: user.default_provider,
    defaultRegion: user.default_region,
  };
}

export async function findOrCreateOAuthUser(email: string, name: string, avatar: string | null) {
  let user = await prisma.user.findFirst({ where: { email } });

  if (!user) {
    const org = await prisma.organisation.create({
      data: { name: `${name}'s Team` },
    });
    user = await prisma.user.create({
      data: { email, name, password_hash: OAUTH_ONLY_SENTINEL, avatar, organisation_id: org.id },
    });
    await prisma.organisationMember.create({
      data: { user_id: user.id, organisation_id: org.id, role: 'owner' },
    });
  }

  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
