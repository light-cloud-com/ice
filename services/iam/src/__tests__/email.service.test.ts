/**
 * Unit tests for email service
 *
 * The current implementation is a console-logging stub; these tests pin the
 * public contract (subject lines, recipient, invite URL composition) so a
 * future swap to a real provider can't silently change wire shape.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('email.service', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    delete process.env.FRONTEND_URL;
  });

  describe('sendOrgInviteEmail', () => {
    it('logs recipient, subject and invite URL with default FRONTEND_URL', async () => {
      // Default branch: FRONTEND_URL env var not set, falls back to localhost.
      const { sendOrgInviteEmail } = await import('../services/email.service.js');

      await sendOrgInviteEmail({
        to: 'invitee@example.com',
        inviterName: 'Alice',
        orgName: 'Acme',
        token: 'tok-abc',
      });

      const lines = logSpy.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(lines.some((l: string) => l.includes('To: invitee@example.com'))).toBe(true);
      expect(lines.some((l: string) => l.includes('Alice invited you to "Acme"'))).toBe(true);
      expect(lines.some((l: string) => l.includes('http://localhost:5173/invite/tok-abc'))).toBe(true);
    });

    it('uses FRONTEND_URL env override when set', async () => {
      process.env.FRONTEND_URL = 'https://app.example.com';
      // Module reads env at import-time — must reset modules so the new value sticks.
      vi.resetModules();
      const { sendOrgInviteEmail } = await import('../services/email.service.js');

      await sendOrgInviteEmail({
        to: 'x@y.com',
        inviterName: 'Bob',
        orgName: 'Beta',
        token: 'tok-z',
      });

      const lines = logSpy.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(lines.some((l: string) => l.includes('https://app.example.com/invite/tok-z'))).toBe(true);
    });

    it('returns void / undefined', async () => {
      const { sendOrgInviteEmail } = await import('../services/email.service.js');
      const result = await sendOrgInviteEmail({
        to: 'a@b.com',
        inviterName: 'A',
        orgName: 'O',
        token: 't',
      });
      expect(result).toBeUndefined();
    });
  });

  describe('sendProjectInviteEmail', () => {
    it('logs recipient and project subject with role', async () => {
      const { sendProjectInviteEmail } = await import('../services/email.service.js');

      await sendProjectInviteEmail({
        to: 'dev@example.com',
        inviterName: 'Carol',
        projectName: 'Phoenix',
        role: 'editor',
      });

      const lines = logSpy.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(lines.some((l: string) => l.includes('To: dev@example.com'))).toBe(true);
      expect(lines.some((l: string) => l.includes(`You've been added to "Phoenix" as editor`))).toBe(true);
    });

    it('returns void / undefined', async () => {
      const { sendProjectInviteEmail } = await import('../services/email.service.js');
      const result = await sendProjectInviteEmail({
        to: 'a@b.com',
        inviterName: 'A',
        projectName: 'P',
        role: 'viewer',
      });
      expect(result).toBeUndefined();
    });
  });
});
