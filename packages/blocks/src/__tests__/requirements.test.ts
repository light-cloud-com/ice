/**
 * Tests for `requirements/index.ts` and the five built-in requirement
 * definitions (github-repo, public-endpoint-domain, dns-a-record,
 * domain-verification, managed-cert-issuance).
 *
 * Each requirement exposes (applies / title / description / check / action),
 * and the resolver bundle in `requirements/index.ts` re-exports all of them
 * as `BUILT_IN_REQUIREMENTS`. Branch coverage targets:
 *
 *   github-repo
 *     applies  → COMPUTE_TYPES_WITH_SOURCE membership; non-compute types skip
 *     description → StaticSite / ServerlessFunction / generic
 *     check    → no repo, valid `source.repo`, legacy repository field, repo
 *                that fails the owner/repo regex
 *     action   → "attach-repo" when no repo / "install-github-app" when set
 *
 *   public-endpoint-domain
 *     applies  → only Network.PublicEndpoint with no domain
 *     check    → always returns 'unmet' with the static message
 *
 *   dns-a-record
 *     applies  → Network.PublicEndpoint AND a real domain (not example.com)
 *     check    → no IP yet → 'unknown'; IP matches resolver → 'verified';
 *                IP mismatch → 'unmet' with details; IPAddress alias works
 *     action   → returns null when domain or ip missing; payload otherwise
 *
 *   domain-verification
 *     applies  → only Network.PublicEndpoint with a domain AND
 *                autoProvisionCert !== false
 *     check    → no domain set → 'unmet'; verifier missing → 'unknown';
 *                verifier returns true → 'verified'; verifier returns false →
 *                'unmet'; verifier throws → 'unmet' with error message
 *     action   → no domain → null; no token → 'pending' label;
 *                token present → 'google-site-verification=<token>'
 *
 *   managed-cert-issuance
 *     applies  → PublicEndpoint OR CustomDomain, with a domain, and
 *                autoProvisionCert !== false
 *     check    → no checker / no certName / no project → 'unknown';
 *                ACTIVE → 'verified'; FAILED_NOT_VISIBLE → 'unmet' with
 *                copy talking about DNS; FAILED_CAA_FORBIDDEN /
 *                FAILED_CAA_CHECKING → 'unmet' with CAA copy; default →
 *                'unmet' generic; throws → 'unmet' with error
 */

import { describe, expect, it, vi } from 'vitest';
import {
  BUILT_IN_REQUIREMENTS,
  dnsARecordRequirement,
  domainVerificationRequirement,
  githubRepoAttachedRequirement,
  managedCertIssuanceRequirement,
  publicEndpointDomainRequirement,
  type RequirementContext,
} from '../requirements';

function makeCtx(over: Partial<RequirementContext> = {}): RequirementContext {
  return {
    block: { id: 'b-1', data: { iceType: 'Compute.StaticSite' } },
    cardId: 'card-1',
    environment: 'production',
    org: { id: 'org-1' },
    ...over,
  } as RequirementContext;
}

describe('BUILT_IN_REQUIREMENTS — barrel surface', () => {
  it('exposes the five built-in definitions', () => {
    expect(BUILT_IN_REQUIREMENTS).toHaveLength(5);
    const ids = BUILT_IN_REQUIREMENTS.map((r) => r.id).sort();
    expect(ids).toEqual(
      [
        'dns-a-record',
        'domain-verification',
        'github-repo-attached',
        'managed-cert-issuance',
        'public-endpoint-domain',
      ].sort(),
    );
  });

  it('re-exports each definition as a named symbol', () => {
    expect(githubRepoAttachedRequirement.id).toBe('github-repo-attached');
    expect(publicEndpointDomainRequirement.id).toBe('public-endpoint-domain');
    expect(dnsARecordRequirement.id).toBe('dns-a-record');
    expect(domainVerificationRequirement.id).toBe('domain-verification');
    expect(managedCertIssuanceRequirement.id).toBe('managed-cert-issuance');
  });

  it('marks every built-in with a stable scope, timing, and blocking flag', () => {
    for (const r of BUILT_IN_REQUIREMENTS) {
      expect(r.scope).toBe('block');
      expect(['before-deploy', 'post-deploy']).toContain(r.timing);
      expect(typeof r.blocking).toBe('boolean');
    }
  });
});

// ---------------------------------------------------------------------------
// github-repo-attached
// ---------------------------------------------------------------------------

describe('githubRepoAttachedRequirement.applies', () => {
  it('returns true for any compute type that needs source code', () => {
    for (const iceType of [
      'Compute.StaticSite',
      'Compute.SSRSite',
      'Compute.Container',
      'Compute.BackendAPI',
      'Compute.Worker',
      'Compute.ServerlessFunction',
    ]) {
      expect(githubRepoAttachedRequirement.applies(makeCtx({ block: { id: 'b', data: { iceType } } }))).toBe(true);
    }
  });

  it('returns false for non-compute iceTypes', () => {
    expect(
      githubRepoAttachedRequirement.applies(makeCtx({ block: { id: 'b', data: { iceType: 'Database.PostgreSQL' } } })),
    ).toBe(false);
  });

  it('returns false when iceType is missing entirely', () => {
    expect(githubRepoAttachedRequirement.applies(makeCtx({ block: { id: 'b', data: {} } }))).toBe(false);
  });
});

describe('githubRepoAttachedRequirement.title and description', () => {
  it('uses a constant title that ignores ctx', () => {
    expect(githubRepoAttachedRequirement.title(makeCtx())).toBe('Attach a source repository');
  });

  it('uses the static-site copy for Compute.StaticSite', () => {
    const out = githubRepoAttachedRequirement.description!(
      makeCtx({ block: { id: 'b', data: { iceType: 'Compute.StaticSite' } } }),
    );
    expect(out).toMatch(/static output/);
  });

  it('uses the function copy for Compute.ServerlessFunction', () => {
    const out = githubRepoAttachedRequirement.description!(
      makeCtx({ block: { id: 'b', data: { iceType: 'Compute.ServerlessFunction' } } }),
    );
    expect(out).toMatch(/package the function/);
  });

  it('falls back to the generic copy for other compute types', () => {
    const out = githubRepoAttachedRequirement.description!(
      makeCtx({ block: { id: 'b', data: { iceType: 'Compute.BackendAPI' } } }),
    );
    expect(out).toMatch(/build and deploy/);
  });
});

describe('githubRepoAttachedRequirement.check', () => {
  it('returns "unmet" when no repository is configured', async () => {
    const result = await githubRepoAttachedRequirement.check(makeCtx());
    expect(result.status).toBe('unmet');
    expect(result.message).toBe('No repository selected.');
    expect(result.lastCheckedAt).toBeTypeOf('string');
  });

  it('returns "met" when a structured source.repo is set', async () => {
    const result = await githubRepoAttachedRequirement.check(
      makeCtx({
        block: {
          id: 'b',
          data: { iceType: 'Compute.StaticSite', source: { repo: 'acme/site', branch: 'main' } },
        },
      }),
    );
    expect(result.status).toBe('met');
    expect(result.message).toMatch(/acme\/site@main/);
  });

  it('returns "met" without a branch suffix when branch is unset', async () => {
    const result = await githubRepoAttachedRequirement.check(
      makeCtx({
        block: { id: 'b', data: { iceType: 'Compute.StaticSite', source: { repo: 'acme/site' } } },
      }),
    );
    expect(result.status).toBe('met');
    expect(result.message).toBe('Using acme/site');
  });

  it('accepts the legacy `repository` field', async () => {
    const result = await githubRepoAttachedRequirement.check(
      makeCtx({
        block: { id: 'b', data: { iceType: 'Compute.StaticSite', repository: 'acme/site' } },
      }),
    );
    expect(result.status).toBe('met');
  });

  it('accepts the legacy `repo` field', async () => {
    const result = await githubRepoAttachedRequirement.check(
      makeCtx({
        block: { id: 'b', data: { iceType: 'Compute.StaticSite', repo: 'acme/site' } },
      }),
    );
    expect(result.status).toBe('met');
  });

  it('accepts the legacy `github` field', async () => {
    const result = await githubRepoAttachedRequirement.check(
      makeCtx({
        block: { id: 'b', data: { iceType: 'Compute.StaticSite', github: 'acme/site' } },
      }),
    );
    expect(result.status).toBe('met');
  });

  it('returns "unmet" when the repo string is not in owner/repo form', async () => {
    const result = await githubRepoAttachedRequirement.check(
      makeCtx({
        block: { id: 'b', data: { iceType: 'Compute.StaticSite', repository: 'just-a-name' } },
      }),
    );
    expect(result.status).toBe('unmet');
    expect(result.message).toMatch(/not a valid repository/);
  });
});

describe('githubRepoAttachedRequirement.action', () => {
  it('returns "attach-repo" with the block id when no repo is set', () => {
    const action = githubRepoAttachedRequirement.action!(
      makeCtx({ block: { id: 'block-7', data: { iceType: 'Compute.StaticSite' } } }),
    );
    expect(action).toEqual({
      type: 'attach-repo',
      label: 'Attach repository',
      payload: { blockId: 'block-7' },
    });
  });

  it('returns "install-github-app" once a structured source.repo is present', () => {
    const action = githubRepoAttachedRequirement.action!(
      makeCtx({
        block: {
          id: 'block-7',
          data: { iceType: 'Compute.StaticSite', source: { repo: 'acme/site' } },
        },
      }),
    );
    expect(action).toEqual({
      type: 'install-github-app',
      label: 'Install GitHub App',
      payload: { repo: 'acme/site' },
    });
  });

  it('returns "install-github-app" when only a legacy repo field is present', () => {
    const action = githubRepoAttachedRequirement.action!(
      makeCtx({
        block: { id: 'block-7', data: { iceType: 'Compute.StaticSite', repository: 'acme/site' } },
      }),
    );
    expect(action!.type).toBe('install-github-app');
  });
});

// ---------------------------------------------------------------------------
// public-endpoint-domain
// ---------------------------------------------------------------------------

describe('publicEndpointDomainRequirement.applies', () => {
  it('returns true for a Public Endpoint without a domain', () => {
    expect(
      publicEndpointDomainRequirement.applies(
        makeCtx({ block: { id: 'b', data: { iceType: 'Network.PublicEndpoint' } } }),
      ),
    ).toBe(true);
  });

  it('returns false when the Public Endpoint already has a domain', () => {
    expect(
      publicEndpointDomainRequirement.applies(
        makeCtx({
          block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'example.com' } },
        }),
      ),
    ).toBe(false);
  });

  it('treats whitespace-only domain as no domain (applies fires)', () => {
    expect(
      publicEndpointDomainRequirement.applies(
        makeCtx({
          block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: '  ' } },
        }),
      ),
    ).toBe(true);
  });
});

describe('publicEndpointDomainRequirement.applies — wrong iceType', () => {
  it('returns false for any iceType other than Network.PublicEndpoint', () => {
    expect(
      publicEndpointDomainRequirement.applies(makeCtx({ block: { id: 'b', data: { iceType: 'Compute.StaticSite' } } })),
    ).toBe(false);
  });
});

describe('publicEndpointDomainRequirement.title and check', () => {
  it('returns the constant title', () => {
    expect(publicEndpointDomainRequirement.title(makeCtx())).toBe('Set a custom domain (optional)');
  });

  it('describes why a domain is needed', () => {
    expect(publicEndpointDomainRequirement.description!(makeCtx())).toMatch(/HTTPS|managed SSL/);
  });

  it('always reports unmet from the check', async () => {
    const result = await publicEndpointDomainRequirement.check(makeCtx());
    expect(result.status).toBe('unmet');
    expect(result.message).toMatch(/IP-only HTTP/);
    expect(result.lastCheckedAt).toBeTypeOf('string');
  });
});

// ---------------------------------------------------------------------------
// dns-a-record (mocks dns/promises)
// ---------------------------------------------------------------------------

vi.mock('dns/promises', () => ({
  resolve4: vi.fn(),
}));

import * as dnsPromises from 'dns/promises';
const mockedResolve4 = dnsPromises.resolve4 as ReturnType<typeof vi.fn>;

describe('dnsARecordRequirement.applies', () => {
  it('returns false for non-PublicEndpoint blocks', () => {
    expect(
      dnsARecordRequirement.applies(
        makeCtx({ block: { id: 'b', data: { iceType: 'Compute.StaticSite', domain: 'foo.com' } } }),
      ),
    ).toBe(false);
  });

  it('returns false when domain is missing', () => {
    expect(
      dnsARecordRequirement.applies(makeCtx({ block: { id: 'b', data: { iceType: 'Network.PublicEndpoint' } } })),
    ).toBe(false);
  });

  it('returns false for the placeholder domain "example.com"', () => {
    expect(
      dnsARecordRequirement.applies(
        makeCtx({
          block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'example.com' } },
        }),
      ),
    ).toBe(false);
  });

  it('returns true for a Public Endpoint with a real domain', () => {
    expect(
      dnsARecordRequirement.applies(
        makeCtx({
          block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
        }),
      ),
    ).toBe(true);
  });
});

describe('dnsARecordRequirement.title and description', () => {
  it('embeds the configured domain', () => {
    const ctx = makeCtx({
      block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
    });
    expect(dnsARecordRequirement.title(ctx)).toBe('Add DNS A record for site.io');
    expect(dnsARecordRequirement.description!(ctx)).toMatch(/site\.io/);
  });
});

describe('dnsARecordRequirement.check', () => {
  beforeEachReset();

  it('returns "unknown" when no IP is in deployedOutputs', async () => {
    const result = await dnsARecordRequirement.check(
      makeCtx({
        block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
      }),
    );
    expect(result.status).toBe('unknown');
    expect(result.message).toMatch(/Deployment output not available/);
  });

  it('returns "verified" when DNS resolves to the deployed IP (ip_address)', async () => {
    mockedResolve4.mockResolvedValueOnce(['1.2.3.4']);
    const result = await dnsARecordRequirement.check(
      makeCtx({
        block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
        deployedOutputs: { ip_address: '1.2.3.4' },
      }),
    );
    expect(result.status).toBe('verified');
    expect(result.message).toMatch(/Resolves to 1\.2\.3\.4/);
  });

  it('accepts the IPAddress alias in deployedOutputs', async () => {
    mockedResolve4.mockResolvedValueOnce(['9.9.9.9']);
    const result = await dnsARecordRequirement.check(
      makeCtx({
        block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
        deployedOutputs: { IPAddress: '9.9.9.9' },
      }),
    );
    expect(result.status).toBe('verified');
  });

  it('returns "unmet" with mismatch detail when DNS resolves to a different IP', async () => {
    mockedResolve4.mockResolvedValueOnce(['5.5.5.5']);
    const result = await dnsARecordRequirement.check(
      makeCtx({
        block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
        deployedOutputs: { ip_address: '1.2.3.4' },
      }),
    );
    expect(result.status).toBe('unmet');
    expect(result.message).toMatch(/Currently resolves to 5\.5\.5\.5/);
    expect(result.details).toEqual({ expected: '1.2.3.4', actual: ['5.5.5.5'] });
  });

  it('returns "unmet" with "does not resolve yet" when DNS resolves empty', async () => {
    mockedResolve4.mockResolvedValueOnce([]);
    const result = await dnsARecordRequirement.check(
      makeCtx({
        block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
        deployedOutputs: { ip_address: '1.2.3.4' },
      }),
    );
    expect(result.status).toBe('unmet');
    expect(result.message).toMatch(/does not resolve yet/);
  });

  it('treats DNS resolver failures as an empty result', async () => {
    mockedResolve4.mockRejectedValueOnce(new Error('NXDOMAIN'));
    const result = await dnsARecordRequirement.check(
      makeCtx({
        block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'unknown.io' } },
        deployedOutputs: { ip_address: '1.2.3.4' },
      }),
    );
    expect(result.status).toBe('unmet');
    expect(result.details).toEqual({ expected: '1.2.3.4', actual: [] });
  });
});

describe('dnsARecordRequirement.action', () => {
  it('returns null when domain is missing', () => {
    expect(
      dnsARecordRequirement.action!(
        makeCtx({
          block: { id: 'b', data: { iceType: 'Network.PublicEndpoint' } },
          deployedOutputs: { ip_address: '1.2.3.4' },
        }),
      ),
    ).toBeNull();
  });

  it('returns null when ip is missing', () => {
    expect(
      dnsARecordRequirement.action!(
        makeCtx({
          block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
        }),
      ),
    ).toBeNull();
  });

  it('returns the copy-DNS-record payload when domain and ip are both set (ip_address)', () => {
    const action = dnsARecordRequirement.action!(
      makeCtx({
        block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
        deployedOutputs: { ip_address: '1.2.3.4' },
      }),
    );
    expect(action).toEqual({
      type: 'copy-dns-record',
      label: 'Copy DNS record',
      payload: {
        record_type: 'A',
        name: 'site.io',
        value: '1.2.3.4',
        ttl: 300,
      },
    });
  });

  it('uses the IPAddress alias when ip_address is missing', () => {
    const action = dnsARecordRequirement.action!(
      makeCtx({
        block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
        deployedOutputs: { IPAddress: '8.8.8.8' },
      }),
    );
    expect(action!.payload!.value).toBe('8.8.8.8');
  });
});

// ---------------------------------------------------------------------------
// domain-verification
// ---------------------------------------------------------------------------

describe('domainVerificationRequirement.applies', () => {
  it('returns false for non-PublicEndpoint blocks', () => {
    expect(
      domainVerificationRequirement.applies(
        makeCtx({
          block: { id: 'b', data: { iceType: 'Compute.StaticSite', domain: 'site.io' } },
        }),
      ),
    ).toBe(false);
  });

  it('returns false when there is no domain', () => {
    expect(
      domainVerificationRequirement.applies(
        makeCtx({ block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: '' } } }),
      ),
    ).toBe(false);
  });

  it('returns false when autoProvisionCert is explicitly false', () => {
    expect(
      domainVerificationRequirement.applies(
        makeCtx({
          block: {
            id: 'b',
            data: {
              iceType: 'Network.PublicEndpoint',
              domain: 'site.io',
              autoProvisionCert: false,
            },
          },
        }),
      ),
    ).toBe(false);
  });

  it('returns true for a Public Endpoint with a domain when autoProvisionCert is unset', () => {
    expect(
      domainVerificationRequirement.applies(
        makeCtx({
          block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
        }),
      ),
    ).toBe(true);
  });
});

describe('domainVerificationRequirement.title and description', () => {
  it('embeds the domain in the title', () => {
    expect(
      domainVerificationRequirement.title(
        makeCtx({
          block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
        }),
      ),
    ).toBe('Verify domain ownership: site.io');
  });

  it('exposes a description string', () => {
    expect(domainVerificationRequirement.description!(makeCtx())).toMatch(/managed SSL/);
  });
});

describe('domainVerificationRequirement.check', () => {
  it('returns "unmet" when no domain is set', async () => {
    const result = await domainVerificationRequirement.check(
      makeCtx({ block: { id: 'b', data: { iceType: 'Network.PublicEndpoint' } } }),
    );
    expect(result.status).toBe('unmet');
    expect(result.message).toMatch(/No domain set/);
  });

  it('returns "unknown" when the verifier is not attached', async () => {
    const result = await domainVerificationRequirement.check(
      makeCtx({
        block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
      }),
    );
    expect(result.status).toBe('unknown');
    expect(result.message).toMatch(/Verification service not available/);
  });

  it('returns "verified" when the verifier reports the domain is verified', async () => {
    const ctx = makeCtx({
      block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
    });
    (ctx as any).googleVerifier = {
      checkVerification: vi.fn().mockResolvedValueOnce(true),
    };
    const result = await domainVerificationRequirement.check(ctx);
    expect(result.status).toBe('verified');
    expect(result.message).toMatch(/Verified for site\.io/);
  });

  it('returns "unmet" when the verifier reports the domain is not verified', async () => {
    const ctx = makeCtx({
      block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
    });
    (ctx as any).googleVerifier = {
      checkVerification: vi.fn().mockResolvedValueOnce(false),
    };
    const result = await domainVerificationRequirement.check(ctx);
    expect(result.status).toBe('unmet');
    expect(result.message).toMatch(/Add the TXT record/);
  });

  it('catches a thrown error from the verifier and returns "unmet" with the message', async () => {
    const ctx = makeCtx({
      block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
    });
    (ctx as any).googleVerifier = {
      checkVerification: vi.fn().mockRejectedValueOnce(new Error('quota exceeded')),
    };
    const result = await domainVerificationRequirement.check(ctx);
    expect(result.status).toBe('unmet');
    expect(result.message).toMatch(/quota exceeded/);
  });

  it('handles non-Error throwables by stringifying them', async () => {
    const ctx = makeCtx({
      block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
    });
    (ctx as any).googleVerifier = {
      checkVerification: vi.fn().mockRejectedValueOnce('string-error'),
    };
    const result = await domainVerificationRequirement.check(ctx);
    expect(result.status).toBe('unmet');
    expect(result.message).toMatch(/string-error/);
  });
});

describe('domainVerificationRequirement.action', () => {
  it('returns null when no domain is set', () => {
    expect(
      domainVerificationRequirement.action!(
        makeCtx({ block: { id: 'b', data: { iceType: 'Network.PublicEndpoint' } } }),
      ),
    ).toBeNull();
  });

  it('returns the pending value when no token is available', () => {
    const action = domainVerificationRequirement.action!(
      makeCtx({
        block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
      }),
    );
    expect(action!.payload!.value).toMatch(/pending/);
    expect(action!.payload!.record_type).toBe('TXT');
  });

  it('returns the google-site-verification token when one is supplied via context', () => {
    const ctx = makeCtx({
      block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
    });
    (ctx as any).verificationTokens = { 'site.io': 'abc123' };
    const action = domainVerificationRequirement.action!(ctx);
    expect(action!.payload!.value).toBe('google-site-verification=abc123');
  });
});

// ---------------------------------------------------------------------------
// managed-cert-issuance
// ---------------------------------------------------------------------------

describe('managedCertIssuanceRequirement.applies', () => {
  it('returns true for Network.PublicEndpoint with a domain', () => {
    expect(
      managedCertIssuanceRequirement.applies(
        makeCtx({
          block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
        }),
      ),
    ).toBe(true);
  });

  it('returns true for Network.CustomDomain with a domain', () => {
    expect(
      managedCertIssuanceRequirement.applies(
        makeCtx({
          block: { id: 'b', data: { iceType: 'Network.CustomDomain', domain: 'site.io' } },
        }),
      ),
    ).toBe(true);
  });

  it('returns false for an unrelated iceType', () => {
    expect(
      managedCertIssuanceRequirement.applies(
        makeCtx({
          block: { id: 'b', data: { iceType: 'Compute.StaticSite', domain: 'site.io' } },
        }),
      ),
    ).toBe(false);
  });

  it('returns false when domain is empty / whitespace-only', () => {
    expect(
      managedCertIssuanceRequirement.applies(
        makeCtx({
          block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: '   ' } },
        }),
      ),
    ).toBe(false);
  });

  it('returns false when domain is undefined (falls back to empty string)', () => {
    expect(
      managedCertIssuanceRequirement.applies(
        makeCtx({ block: { id: 'b', data: { iceType: 'Network.PublicEndpoint' } } }),
      ),
    ).toBe(false);
  });

  it('returns false when autoProvisionCert is explicitly false', () => {
    expect(
      managedCertIssuanceRequirement.applies(
        makeCtx({
          block: {
            id: 'b',
            data: {
              iceType: 'Network.PublicEndpoint',
              domain: 'site.io',
              autoProvisionCert: false,
            },
          },
        }),
      ),
    ).toBe(false);
  });
});

describe('managedCertIssuanceRequirement.title', () => {
  it('embeds the domain', () => {
    expect(
      managedCertIssuanceRequirement.title(
        makeCtx({
          block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
        }),
      ),
    ).toBe('SSL certificate issuance for site.io');
  });

  it('exposes a description', () => {
    expect(managedCertIssuanceRequirement.description!(makeCtx())).toMatch(/15-60 minutes/);
  });
});

describe('managedCertIssuanceRequirement.check', () => {
  function ctxWithChecker(status: string, throws: any = null) {
    const ctx = makeCtx({
      block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
      gcpProject: 'proj-1',
    });
    (ctx as any).certResourceName = 'cert-1';
    (ctx as any).certStatusChecker = {
      fetchStatus: vi.fn().mockImplementation(() => {
        if (throws) throw throws;
        return Promise.resolve({ status, domain_statuses: { 'site.io': 'ACTIVE' } });
      }),
    };
    return ctx;
  }

  it('returns "unknown" when the checker is not attached', async () => {
    const result = await managedCertIssuanceRequirement.check(
      makeCtx({
        block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
        gcpProject: 'proj-1',
      }),
    );
    expect(result.status).toBe('unknown');
  });

  it('returns "unknown" when domain is undefined and checker is missing', async () => {
    // Exercise the `|| ''` fallback for ctx.block.data?.domain inside check.
    const result = await managedCertIssuanceRequirement.check(
      makeCtx({
        block: { id: 'b', data: { iceType: 'Network.PublicEndpoint' } },
        gcpProject: 'proj-1',
      }),
    );
    expect(result.status).toBe('unknown');
  });

  it('returns "unknown" when certResourceName is missing', async () => {
    const ctx = makeCtx({
      block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
      gcpProject: 'proj-1',
    });
    (ctx as any).certStatusChecker = { fetchStatus: vi.fn() };
    const result = await managedCertIssuanceRequirement.check(ctx);
    expect(result.status).toBe('unknown');
  });

  it('returns "unknown" when gcpProject is missing', async () => {
    const ctx = makeCtx({
      block: { id: 'b', data: { iceType: 'Network.PublicEndpoint', domain: 'site.io' } },
    });
    (ctx as any).certStatusChecker = { fetchStatus: vi.fn() };
    (ctx as any).certResourceName = 'cert-1';
    const result = await managedCertIssuanceRequirement.check(ctx);
    expect(result.status).toBe('unknown');
  });

  it('returns "verified" when the cert is ACTIVE', async () => {
    const result = await managedCertIssuanceRequirement.check(ctxWithChecker('ACTIVE'));
    expect(result.status).toBe('verified');
    expect(result.message).toMatch(/live for site\.io/);
  });

  it('returns "unmet" with DNS-visibility copy on FAILED_NOT_VISIBLE', async () => {
    const result = await managedCertIssuanceRequirement.check(ctxWithChecker('FAILED_NOT_VISIBLE'));
    expect(result.status).toBe('unmet');
    expect(result.message).toMatch(/cannot see your DNS/);
  });

  it('returns "unmet" with CAA copy on FAILED_CAA_FORBIDDEN', async () => {
    const result = await managedCertIssuanceRequirement.check(ctxWithChecker('FAILED_CAA_FORBIDDEN'));
    expect(result.status).toBe('unmet');
    expect(result.message).toMatch(/CAA record/);
  });

  it('returns "unmet" with CAA copy on FAILED_CAA_CHECKING', async () => {
    const result = await managedCertIssuanceRequirement.check(ctxWithChecker('FAILED_CAA_CHECKING'));
    expect(result.status).toBe('unmet');
    expect(result.message).toMatch(/CAA record/);
  });

  it('returns "unmet" with the generic still-working copy for unhandled statuses', async () => {
    const result = await managedCertIssuanceRequirement.check(ctxWithChecker('PROVISIONING'));
    expect(result.status).toBe('unmet');
    expect(result.message).toMatch(/Status: PROVISIONING/);
  });

  it('returns "unmet" with the error message when the checker throws', async () => {
    const result = await managedCertIssuanceRequirement.check(ctxWithChecker('UNUSED', new Error('rpc deadline')));
    expect(result.status).toBe('unmet');
    expect(result.message).toMatch(/rpc deadline/);
  });

  it('handles non-Error throwables by stringifying them', async () => {
    const result = await managedCertIssuanceRequirement.check(ctxWithChecker('UNUSED', 'string-error'));
    expect(result.status).toBe('unmet');
    expect(result.message).toMatch(/string-error/);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function beforeEachReset() {
  // Vitest's `beforeEach` is global via globals: true — wrap so we can call
  // it inside a `describe` block for narrower scoping.

  beforeEach(() => {
    mockedResolve4.mockReset();
  });
}
