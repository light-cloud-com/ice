/**
 * Passport OAuth Strategies — Google + GitHub
 *
 * Uses auth.service.findOrCreateOAuthUser for user management.
 */

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import prisma from '@ice/db';
import { findOrCreateOAuthUser } from '../services/auth.service';

export function configurePassportOAuth() {
  // ── Google ──────────────────────────────────────────────────────────────

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: `${process.env.BACKEND_URL || 'http://localhost:5001'}/api/auth/google/callback`,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value || `${profile.id}@google.local`;
            const name = profile.displayName || 'Google User';
            const avatar = profile.photos?.[0]?.value || null;
            const user = await findOrCreateOAuthUser(email, name, avatar);
            done(null, user);
          } catch (err) {
            done(err as Error);
          }
        },
      ),
    );
  }

  // ── GitHub ──────────────────────────────────────────────────────────────

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          callbackURL: `${process.env.BACKEND_URL || 'http://localhost:5001'}/api/auth/github/callback`,
          scope: ['user:email'],
        },
        async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
          try {
            // Use GitHub user ID as the unique identifier to prevent email collisions.
            // Two GitHub users with no public email would otherwise collide on a synthesized email.
            const githubId = profile.id;
            const email = profile.emails?.[0]?.value || `gh-${githubId}@github.oauth`;
            const name = profile.displayName || profile.username || 'GitHub User';
            const avatar = profile.photos?.[0]?.value || null;
            const user = await findOrCreateOAuthUser(email, name, avatar);
            done(null, user);
          } catch (err) {
            done(err as Error);
          }
        },
      ),
    );
  }

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  });
}
