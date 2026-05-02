/**
 * `error-remediation.ts` invariant tests.
 *
 * `classifyError(rawMessage)` walks the REMEDIATIONS table in declaration
 * order and returns the first entry whose `pattern` matches, with the
 * `pattern` field stripped from the returned object.
 *
 * Tests pin:
 *   - The early-return guard for null/undefined/empty inputs.
 *   - One match per table entry, exercising every alternative of the
 *     OR-joined regex.
 *   - The "first match wins" priority — the table is ordered, and that
 *     order is part of the contract.
 *   - The returned shape (id/title/explanation/actions, NO `pattern`).
 *   - Returns null when no entry matches.
 */

import { describe, it, expect } from 'vitest';
import { classifyError } from '../error-remediation';

// ─── Early returns ─────────────────────────────────────────────────────────

describe('classifyError (early returns)', () => {
  it('returns null when rawMessage is undefined', () => {
    expect(classifyError(undefined)).toBeNull();
  });

  it('returns null when rawMessage is null', () => {
    expect(classifyError(null)).toBeNull();
  });

  it('returns null when rawMessage is an empty string', () => {
    expect(classifyError('')).toBeNull();
  });

  it('returns null when no pattern matches', () => {
    expect(classifyError('this is some random text with no GCP error markers')).toBeNull();
  });
});

// ─── Returned shape ────────────────────────────────────────────────────────

describe('classifyError (returned shape)', () => {
  it('omits the pattern field from the returned object', () => {
    const r = classifyError('BILLING_DISABLED');
    expect(r).not.toBeNull();
    expect(r).not.toHaveProperty('pattern');
    expect(Object.keys(r!).sort()).toEqual(['actions', 'explanation', 'id', 'title']);
  });

  it('returns id/title/explanation/actions on a matched entry', () => {
    const r = classifyError('BILLING_DISABLED');
    expect(r).toEqual({
      id: 'billing-not-enabled',
      title: 'Billing account not linked',
      explanation: expect.stringContaining('billing account'),
      actions: [
        {
          label: 'Open billing console',
          href: 'https://console.cloud.google.com/billing',
        },
        { label: 'Retry deploy', onClick: 'retry' },
      ],
    });
  });
});

// ─── billing-not-enabled ───────────────────────────────────────────────────

describe('classifyError — billing-not-enabled', () => {
  it.each([
    'billing account is missing',
    'BILLING_DISABLED',
    'billing is not enabled for this project',
    'BILLING ACCOUNT not linked', // case-insensitive on `billing account`
  ])('matches %s', (msg) => {
    expect(classifyError(msg)?.id).toBe('billing-not-enabled');
  });
});

// ─── permission-denied ─────────────────────────────────────────────────────

describe('classifyError — permission-denied', () => {
  it.each([
    'PERMISSION_DENIED',
    'Resource not accessible by personal access token',
    'caller does not have permission to access',
    "required 'serviceusage.services.use'",
  ])('matches %s', (msg) => {
    expect(classifyError(msg)?.id).toBe('permission-denied');
  });

  it('includes Open IAM settings + Reconnect provider actions', () => {
    const r = classifyError('PERMISSION_DENIED');
    expect(r?.actions).toEqual([
      {
        label: 'Open IAM settings',
        href: 'https://console.cloud.google.com/iam-admin/iam',
      },
      { label: 'Reconnect provider', onClick: 'authenticate' },
    ]);
  });
});

// ─── api-not-enabled ───────────────────────────────────────────────────────

describe('classifyError — api-not-enabled', () => {
  it.each([
    'SERVICE_DISABLED',
    'API has not been used in this project',
    'has not been enabled for this project',
  ])('matches %s', (msg) => {
    expect(classifyError(msg)?.id).toBe('api-not-enabled');
  });

  it('includes Open API library + Retry deploy actions', () => {
    const r = classifyError('SERVICE_DISABLED');
    expect(r?.actions).toEqual([
      {
        label: 'Open API library',
        href: 'https://console.cloud.google.com/apis/library',
      },
      { label: 'Retry deploy', onClick: 'retry' },
    ]);
  });
});

// ─── quota-exceeded ────────────────────────────────────────────────────────

describe('classifyError — quota-exceeded', () => {
  it.each(['QUOTA_EXCEEDED', 'quota was exceeded', 'exceeded quota for region'])(
    'matches %s',
    (msg) => {
      expect(classifyError(msg)?.id).toBe('quota-exceeded');
    },
  );

  it('only includes the quota-increase action (no retry)', () => {
    const r = classifyError('QUOTA_EXCEEDED');
    expect(r?.actions).toEqual([
      {
        label: 'Request quota increase',
        href: 'https://console.cloud.google.com/iam-admin/quotas',
      },
    ]);
  });
});

// ─── already-exists ────────────────────────────────────────────────────────

describe('classifyError — already-exists', () => {
  it.each(['ALREADY_EXISTS', 'name is already in use', 'resource already exists'])(
    'matches %s',
    (msg) => {
      expect(classifyError(msg)?.id).toBe('already-exists');
    },
  );

  it('includes a single Open GCP console action', () => {
    const r = classifyError('ALREADY_EXISTS');
    expect(r?.actions).toEqual([
      { label: 'Open GCP console', href: 'https://console.cloud.google.com/' },
    ]);
  });
});

// ─── invalid-argument ──────────────────────────────────────────────────────

describe('classifyError — invalid-argument', () => {
  it.each(['INVALID_ARGUMENT', 'invalid value provided', 'is not a valid format'])(
    'matches %s',
    (msg) => {
      expect(classifyError(msg)?.id).toBe('invalid-argument');
    },
  );

  it('returns no actions (advisory remediation only)', () => {
    expect(classifyError('INVALID_ARGUMENT')?.actions).toEqual([]);
  });
});

// ─── cert-required ─────────────────────────────────────────────────────────

describe('classifyError — cert-required', () => {
  it('matches the verbatim cert-map error string', () => {
    expect(
      classifyError('Certificate Map or at least 1 SSL certificate must be specified')?.id,
    ).toBe('cert-required');
  });

  it('returns no actions for cert-required', () => {
    expect(
      classifyError('Certificate Map or at least 1 SSL certificate must be specified')?.actions,
    ).toEqual([]);
  });

  it('does NOT match if the phrase is fragmented or paraphrased', () => {
    expect(classifyError('At least 1 SSL certificate is needed')).toBeNull();
  });
});

// ─── deadline-exceeded ─────────────────────────────────────────────────────

describe('classifyError — deadline-exceeded', () => {
  it.each(['DEADLINE_EXCEEDED', 'operation deadline exceeded', 'operation timed out'])(
    'matches %s',
    (msg) => {
      expect(classifyError(msg)?.id).toBe('deadline-exceeded');
    },
  );

  it('includes Retry deploy action', () => {
    expect(classifyError('DEADLINE_EXCEEDED')?.actions).toEqual([
      { label: 'Retry deploy', onClick: 'retry' },
    ]);
  });
});

// ─── network-error ─────────────────────────────────────────────────────────

describe('classifyError — network-error', () => {
  it.each([
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND api.googleapis.com',
    'transient network error',
    'unexpected end of json',
  ])('matches %s', (msg) => {
    expect(classifyError(msg)?.id).toBe('network-error');
  });

  it('includes Retry deploy action', () => {
    expect(classifyError('ECONNRESET')?.actions).toEqual([
      { label: 'Retry deploy', onClick: 'retry' },
    ]);
  });
});

// ─── First-match wins ──────────────────────────────────────────────────────

describe('classifyError — first match in REMEDIATIONS table wins', () => {
  it('billing-not-enabled wins over permission-denied when both phrases present', () => {
    // billing-not-enabled is declared before permission-denied in the
    // table, so a message containing both phrases must classify as the
    // earlier one.
    expect(
      classifyError('billing account missing AND PERMISSION_DENIED')?.id,
    ).toBe('billing-not-enabled');
  });

  it('permission-denied wins over api-not-enabled when both phrases present', () => {
    expect(
      classifyError('PERMISSION_DENIED — also has not been enabled')?.id,
    ).toBe('permission-denied');
  });

  it('quota-exceeded wins over already-exists when both phrases present', () => {
    expect(classifyError('QUOTA_EXCEEDED ALREADY_EXISTS')?.id).toBe('quota-exceeded');
  });

  it('deadline-exceeded wins over network-error when both phrases present', () => {
    expect(classifyError('DEADLINE_EXCEEDED ECONNRESET')?.id).toBe('deadline-exceeded');
  });
});
