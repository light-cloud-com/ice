/**
 * Unit tests for `services/ai/src/services/ai/deployment-context.ts`
 * — the DB-backed deployment context builder + formatAge helper
 * extracted in rf-aisvc-3 from `ai.service.ts`.
 *
 * Per `deploy-service-tests-must-import-vitest-explicitly`, vitest
 * globals are imported explicitly so the @ice/service-ai package's
 * typecheck stays green.
 */

import prisma from '@ice/db';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildDeploymentContext, formatAge } from '../deployment-context';

vi.mock('@ice/db', () => ({
  default: {
    canvasDeployment: {
      findFirst: vi.fn(),
    },
  },
}));

const findFirstMock = prisma.canvasDeployment.findFirst as unknown as ReturnType<typeof vi.fn>;

describe('formatAge', () => {
  it('returns "just now" for ages under one minute', () => {
    expect(formatAge(0)).toBe('just now');
    expect(formatAge(15_000)).toBe('just now');
    expect(formatAge(59_999)).toBe('just now');
  });

  it('returns "1 minute ago" for exactly one minute (singular)', () => {
    expect(formatAge(60_000)).toBe('1 minute ago');
  });

  it('returns "N minutes ago" for 2..59 minutes (plural)', () => {
    expect(formatAge(2 * 60_000)).toBe('2 minutes ago');
    expect(formatAge(5 * 60_000)).toBe('5 minutes ago');
    expect(formatAge(59 * 60_000)).toBe('59 minutes ago');
  });

  it('returns "1 hour ago" for exactly one hour (singular)', () => {
    expect(formatAge(60 * 60_000)).toBe('1 hour ago');
  });

  it('returns "N hours ago" for 2..23 hours (plural)', () => {
    expect(formatAge(2 * 60 * 60_000)).toBe('2 hours ago');
    expect(formatAge(23 * 60 * 60_000)).toBe('23 hours ago');
  });

  it('returns "1 day ago" for exactly 24 hours (singular)', () => {
    expect(formatAge(24 * 60 * 60_000)).toBe('1 day ago');
  });

  it('returns "N days ago" for 2+ days (plural)', () => {
    expect(formatAge(2 * 24 * 60 * 60_000)).toBe('2 days ago');
    expect(formatAge(7 * 24 * 60 * 60_000)).toBe('7 days ago');
  });

  it('floors fractional minutes — 90s is 1 minute, not 2', () => {
    expect(formatAge(90 * 1000)).toBe('1 minute ago');
  });
});

describe('buildDeploymentContext', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    findFirstMock.mockReset();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  it('returns the not-deployed-yet message when prisma returns null', async () => {
    findFirstMock.mockResolvedValue(null);

    const out = await buildDeploymentContext('card-1');

    expect(out).toContain('## Deployment Status');
    expect(out).toContain('not been deployed yet');
    // The not-yet branch ends with a single trailing newline (no resources block).
    expect(out.startsWith('\n## Deployment Status\n')).toBe(true);
  });

  it('queries with the expected where/orderBy clauses', async () => {
    findFirstMock.mockResolvedValue(null);

    await buildDeploymentContext('card-xyz');

    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        card_id: 'card-xyz',
        action_type: 'apply',
        status: { in: ['success', 'partial', 'failed'] },
      },
      orderBy: { created_at: 'desc' },
    });
  });

  it('renders the header for a deploy with no results array', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T12:30:00Z'));
    findFirstMock.mockResolvedValue({
      created_at: new Date('2026-04-30T12:00:00Z'),
      status: 'success',
      provider: 'gcp',
      region: 'us-central1',
      environment: 'production',
      results: null,
    });

    const out = await buildDeploymentContext('card-2');

    expect(out).toContain('Last deployed: 30 minutes ago (success)');
    expect(out).toContain('Provider: gcp | Region: us-central1 | Environment: production');
    expect(out).not.toContain('Deployed resources:');
    expect(out).not.toContain('Errors:');
  });

  it('lists deployed resources with name/type/action/success and an outputs.url URL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T12:00:00Z'));
    findFirstMock.mockResolvedValue({
      created_at: new Date('2026-04-30T11:00:00Z'),
      status: 'success',
      provider: 'aws',
      region: 'us-east-1',
      environment: 'staging',
      results: {
        resources: [
          {
            name: 'orders-api',
            type: 'Compute.Container',
            action: 'create',
            success: true,
            outputs: { url: 'https://api.example.com' },
          },
        ],
      },
    });

    const out = await buildDeploymentContext('card-3');

    expect(out).toContain('Deployed resources:');
    expect(out).toContain('"orders-api" (Compute.Container) create ✓ — https://api.example.com');
  });

  it('falls back to outputs.endpoint then provider_id for the URL field', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T12:00:00Z'));
    findFirstMock.mockResolvedValue({
      created_at: new Date('2026-04-30T12:00:00Z'),
      status: 'success',
      provider: 'aws',
      region: 'us-east-1',
      environment: 'staging',
      results: {
        resources: [
          {
            name: 'svc-a',
            type: 'X',
            action: 'update',
            success: true,
            outputs: { endpoint: 'svc.internal:8080' },
          },
          {
            name: 'svc-b',
            type: 'X',
            action: 'update',
            success: true,
            provider_id: 'arn:aws:something',
          },
        ],
      },
    });

    const out = await buildDeploymentContext('card-4');

    expect(out).toContain('"svc-a" (X) update ✓ — svc.internal:8080');
    expect(out).toContain('"svc-b" (X) update ✓ — arn:aws:something');
  });

  it('omits the URL suffix when no url/endpoint/provider_id is present', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T12:00:00Z'));
    findFirstMock.mockResolvedValue({
      created_at: new Date('2026-04-30T12:00:00Z'),
      status: 'success',
      provider: 'aws',
      region: 'us-east-1',
      environment: 'staging',
      results: {
        resources: [{ name: 'svc-c', type: 'Y', action: 'create', success: true }],
      },
    });

    const out = await buildDeploymentContext('card-5');

    // No em-dash separator means no URL appended.
    expect(out).toContain('"svc-c" (Y) create ✓');
    expect(out).not.toContain('—');
  });

  it('uses "(unnamed)" / "unknown" / "" defaults for missing resource fields', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T12:00:00Z'));
    findFirstMock.mockResolvedValue({
      created_at: new Date('2026-04-30T12:00:00Z'),
      status: 'success',
      provider: 'aws',
      region: 'us-east-1',
      environment: 'staging',
      results: {
        resources: [{}], // every field missing
      },
    });

    const out = await buildDeploymentContext('card-6');

    expect(out).toContain('"(unnamed)" (unknown)');
    // Empty action collapses via `replace(/\s+/g, ' ').trimEnd()`
    expect(out).not.toContain('  '); // no double-space leftover
  });

  it('renders the empty-string success cell when r.success is neither true nor false', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T12:00:00Z'));
    findFirstMock.mockResolvedValue({
      created_at: new Date('2026-04-30T12:00:00Z'),
      status: 'partial',
      provider: 'aws',
      region: 'us-east-1',
      environment: 'staging',
      results: {
        resources: [{ name: 'svc-d', type: 'Z', action: 'create' /* success undefined */ }],
      },
    });

    const out = await buildDeploymentContext('card-7');

    // Neither ✓ nor ✗
    expect(out).not.toMatch(/✓|✗/);
    expect(out).toContain('"svc-d" (Z) create');
  });

  it('renders the Errors block only for failed resources WITH an error string', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T12:00:00Z'));
    findFirstMock.mockResolvedValue({
      created_at: new Date('2026-04-30T12:00:00Z'),
      status: 'partial',
      provider: 'aws',
      region: 'us-east-1',
      environment: 'staging',
      results: {
        resources: [
          { name: 'ok', type: 'X', action: 'create', success: true },
          { name: 'broke', type: 'X', action: 'create', success: false, error: 'boom' },
          { name: 'broke-no-msg', type: 'X', action: 'create', success: false }, // omitted from Errors
        ],
      },
    });

    const out = await buildDeploymentContext('card-8');

    expect(out).toContain('Errors:');
    expect(out).toContain('- broke: boom');
    expect(out).not.toContain('- broke-no-msg');
  });

  it('skips the Errors block when no resources failed with an error', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T12:00:00Z'));
    findFirstMock.mockResolvedValue({
      created_at: new Date('2026-04-30T12:00:00Z'),
      status: 'success',
      provider: 'aws',
      region: 'us-east-1',
      environment: 'staging',
      results: {
        resources: [{ name: 'ok', type: 'X', action: 'create', success: true }],
      },
    });

    const out = await buildDeploymentContext('card-9');

    expect(out).not.toContain('Errors:');
  });

  it('returns "" and warns on prisma throw', async () => {
    findFirstMock.mockRejectedValue(new Error('connection lost'));

    const out = await buildDeploymentContext('card-x');

    expect(out).toBe('');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('Failed to build deployment context');
    expect(warnSpy.mock.calls[0]?.[1]).toBe('connection lost');
  });

  it('handles a prisma throw of a non-Error value via the (err as Error).message cast', async () => {
    // The source casts `err as Error` then reads `.message`. For a thrown
    // string the `.message` access yields `undefined` — exercise that path
    // and assert we still return "" and don't bubble the throw.
    findFirstMock.mockRejectedValue('plain-string');

    const out = await buildDeploymentContext('card-y');

    expect(out).toBe('');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
