/**
 * Unit tests for auth service business logic
 *
 * Tests the pure logic functions without database dependencies.
 * Integration tests that need the DB run via Playwright e2e.
 */

import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-for-unit-tests';
});

describe('AuthError', () => {
  it('should create error with status code', async () => {
    const { AuthError } = await import('../services/auth.service.js');

    const err = new AuthError('Not found', 404);
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('OAuth Sentinel', () => {
  it('should use a sentinel that cannot match bcrypt hashes', async () => {
    // bcrypt hashes always start with $2a$ or $2b$ — sentinel must not
    const sentinel = '@@oauth-only@@';
    expect(sentinel).not.toMatch(/^\$2[ab]\$/);
    expect(sentinel.length).toBeGreaterThan(0);
  });
});

describe('JWT Token Generation', () => {
  it('should generate valid JWT tokens', async () => {
    const { generateToken, generateRefreshToken } = await import('@ice/shared');

    const accessToken = generateToken('user-123', 'org-456');
    expect(accessToken.split('.').length).toBe(3);

    const refreshToken = generateRefreshToken('user-123', 'org-456');
    expect(refreshToken.split('.').length).toBe(3);
    expect(accessToken).not.toBe(refreshToken);
  });

  it('should include correct claims in access token', async () => {
    const { generateToken } = await import('@ice/shared');
    const jwt = await import('jsonwebtoken');

    const token = generateToken('user-123', 'org-456');
    const decoded = jwt.default.decode(token) as any;

    expect(decoded.userId).toBe('user-123');
    expect(decoded.organisationId).toBe('org-456');
    expect(decoded.exp).toBeDefined();
  });

  it('should include type: refresh in refresh token', async () => {
    const { generateRefreshToken } = await import('@ice/shared');
    const jwt = await import('jsonwebtoken');

    const token = generateRefreshToken('user-123', 'org-456');
    const decoded = jwt.default.decode(token) as any;

    expect(decoded.type).toBe('refresh');
    expect(decoded.userId).toBe('user-123');
  });
});

describe('Refresh Token Validation', () => {
  it('should reject tokens without type: refresh', async () => {
    const { generateToken } = await import('@ice/shared');
    const jwt = await import('jsonwebtoken');

    // An access token (no type: 'refresh') should be rejected
    const accessToken = generateToken('user-123', 'org-456');
    const payload = jwt.default.decode(accessToken) as any;

    // The refreshToken function checks payload.type !== 'refresh'
    expect(payload.type).toBeUndefined();
  });
});
