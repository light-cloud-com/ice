/**
 * Auth Service — Business logic for authentication
 *
 * Extracted from routes/auth.ts and routes/oauth.ts
 */

import bcrypt from 'bcryptjs';
import prisma from '@ice-saas/db';
import { generateToken, generateRefreshToken } from '@ice-saas/shared';

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

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AuthError('Invalid credentials', 401);
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

export async function refreshToken(token: string, payload: { userId: string; organisationId: string }): Promise<string> {
  const stored = await prisma.refreshToken.findUnique({ where: { token } });
  if (!stored || stored.expires_at < new Date()) {
    throw new AuthError('Invalid refresh token', 401);
  }

  return generateToken(payload.userId, payload.organisationId);
}

export async function logoutUser(refreshTokenValue: string | undefined): Promise<void> {
  if (refreshTokenValue) {
    await prisma.refreshToken.deleteMany({ where: { token: refreshTokenValue } }).catch(() => {});
  }
}

export async function getProfile(userId: string) {
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
    },
  });
  if (!user) throw new AuthError('User not found', 404);

  // Get organisations from membership table (real roles)
  const memberships = await prisma.organisationMember.findMany({
    where: { user_id: user.id },
    include: { organisation: { select: { id: true, name: true } } },
  });

  // Also include the user's default org if not in memberships
  const memberOrgIds = new Set(memberships.map((m) => m.organisation_id));
  let extraOrgs: { id: string; name: string; role: string }[] = [];
  if (user.organisation_id && !memberOrgIds.has(user.organisation_id)) {
    const org = await prisma.organisation.findUnique({
      where: { id: user.organisation_id },
      select: { id: true, name: true },
    });
    if (org) extraOrgs = [{ ...org, role: 'owner' }];
  }

  const organisations = [
    ...memberships.map((m) => ({ id: m.organisation.id, name: m.organisation.name, role: m.role })),
    ...extraOrgs,
  ];

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    organisations,
    onboardingCompleted: user.onboarding_completed,
    onboardingStep: user.onboarding_step,
    defaultProvider: user.default_provider,
    defaultRegion: user.default_region,
  };
}

export async function findOrCreateOAuthUser(
  email: string,
  name: string,
  avatar: string | null
) {
  let user = await prisma.user.findFirst({ where: { email } });

  if (!user) {
    const org = await prisma.organisation.create({
      data: { name: `${name}'s Team` },
    });
    user = await prisma.user.create({
      data: { email, name, password_hash: '', avatar, organisation_id: org.id },
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
