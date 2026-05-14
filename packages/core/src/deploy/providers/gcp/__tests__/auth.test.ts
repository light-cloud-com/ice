/**
 * Tests for `gcp/auth.ts`.
 *
 * The module wraps three GCP authentication strategies (ADC, service-account
 * key file, OAuth2) plus a credentials validator and a project lister, all
 * routed through the dynamic loader `load_sdk('google-auth-library')`.
 *
 * Strategy: mock `./sdk-loader.js` at the module boundary so we can swap in a
 * synthetic `google-auth-library` shape per test (or return null to exercise
 * the "library not installed" branch). Each helper is then driven through its
 * branches by varying `config.method`, missing config arms, and the underlying
 * client's `getAccessToken` / `request` behaviour.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================

// Hoisted bag so each test can swap the synthetic SDK without re-mocking.
const sdkBag: { load_sdk: any } = { load_sdk: vi.fn() };

vi.mock('../sdk-loader', () => ({
  load_sdk: (...args: unknown[]) => sdkBag.load_sdk(...args),
}));

import {
  get_gcp_credentials,
  validate_gcp_credentials,
  list_gcp_projects,
  type GCPAuthConfig,
} from '../auth';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build a synthetic google-auth-library SDK with adjustable client behaviour.
 *
 * Real classes are needed because the SUT calls `new sdk.GoogleAuth(...)` and
 * `new sdk.OAuth2Client(...)`. Arrow-function `vi.fn()` mocks cannot be
 * invoked with `new` and will surface as "X is not a constructor" wrapped into
 * the SDK init error. See `gcp-importer coverage` learning anchor.
 */
function makeSdk(opts: {
  authClient?: any;
  oauthClient?: any;
  credentials?: any;
  authClientThrows?: boolean;
} = {}) {
  const defaultAuthClient = opts.authClient ?? {
    getAccessToken: vi.fn().mockResolvedValue({ token: 'access-token' }),
    request: vi.fn().mockResolvedValue({ data: {} }),
  };
  const defaultOAuthClient = opts.oauthClient ?? {
    setCredentials: vi.fn(),
    getAccessToken: vi.fn().mockResolvedValue({ token: 'oauth-token' }),
  };
  const googleAuthInstances: any[] = [];
  const oauthInstances: any[] = [];
  const googleAuthCalls: any[] = [];
  const oauthCalls: any[] = [];

  class FakeGoogleAuth {
    args: any;
    getClient: any;
    getCredentials: any;
    constructor(args: any) {
      googleAuthCalls.push(args);
      this.args = args;
      this.getClient = opts.authClientThrows
        ? vi.fn().mockRejectedValue(new Error('boom'))
        : vi.fn().mockResolvedValue(defaultAuthClient);
      this.getCredentials = vi.fn().mockResolvedValue(
        opts.credentials === undefined ? { client_email: 'svc@p.iam' } : opts.credentials,
      );
      googleAuthInstances.push(this);
    }
  }
  class FakeOAuth2Client {
    setCredentials: any;
    getAccessToken: any;
    clientId: string;
    clientSecret: string;
    constructor(clientId: string, clientSecret: string) {
      oauthCalls.push([clientId, clientSecret]);
      this.clientId = clientId;
      this.clientSecret = clientSecret;
      this.setCredentials = vi.fn(defaultOAuthClient.setCredentials);
      this.getAccessToken = defaultOAuthClient.getAccessToken;
      oauthInstances.push(this);
    }
  }

  const sdk = {
    GoogleAuth: FakeGoogleAuth,
    OAuth2Client: FakeOAuth2Client,
  };
  return { sdk, googleAuthInstances, oauthInstances, googleAuthCalls, oauthCalls };
}

beforeEach(() => {
  sdkBag.load_sdk = vi.fn();
});

// =============================================================================
// get_gcp_credentials
// =============================================================================

describe('get_gcp_credentials', () => {
  it('throws when google-auth-library is not installed', async () => {
    sdkBag.load_sdk.mockResolvedValue(null);
    const cfg: GCPAuthConfig = { method: 'adc', project_id: 'p1' };
    await expect(get_gcp_credentials(cfg)).rejects.toThrow(/google-auth-library not installed/);
  });

  it("uses GoogleAuth({scopes, projectId}) for the 'adc' method", async () => {
    const { sdk, googleAuthInstances, googleAuthCalls } = makeSdk();
    sdkBag.load_sdk.mockResolvedValue(sdk);
    const cfg: GCPAuthConfig = { method: 'adc', project_id: 'p1' };

    const client = await get_gcp_credentials(cfg);

    expect(googleAuthCalls[0]).toEqual({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      projectId: 'p1',
    });
    expect(googleAuthInstances[0].getClient).toHaveBeenCalled();
    expect(client).toBeDefined();
  });

  it("throws when 'service-account' is selected without a key_file_path", async () => {
    const { sdk } = makeSdk();
    sdkBag.load_sdk.mockResolvedValue(sdk);
    const cfg: GCPAuthConfig = { method: 'service-account', project_id: 'p1' };

    await expect(get_gcp_credentials(cfg)).rejects.toThrow(/Service account key file path is required/);
  });

  it("uses GoogleAuth({keyFile, scopes, projectId}) for the 'service-account' method", async () => {
    const { sdk, googleAuthInstances, googleAuthCalls } = makeSdk();
    sdkBag.load_sdk.mockResolvedValue(sdk);
    const cfg: GCPAuthConfig = {
      method: 'service-account',
      project_id: 'p1',
      key_file_path: '/tmp/sa.json',
    };

    await get_gcp_credentials(cfg);

    expect(googleAuthCalls[0]).toEqual({
      keyFile: '/tmp/sa.json',
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      projectId: 'p1',
    });
    expect(googleAuthInstances[0].getClient).toHaveBeenCalled();
  });

  it("throws when 'oauth' is selected without an oauth credentials block", async () => {
    const { sdk } = makeSdk();
    sdkBag.load_sdk.mockResolvedValue(sdk);
    const cfg: GCPAuthConfig = { method: 'oauth', project_id: 'p1' };

    await expect(get_gcp_credentials(cfg)).rejects.toThrow(/OAuth2 credentials are required/);
  });

  it("constructs an OAuth2Client and calls setCredentials with the refresh_token for 'oauth'", async () => {
    const { sdk, oauthInstances, oauthCalls } = makeSdk();
    sdkBag.load_sdk.mockResolvedValue(sdk);
    const cfg: GCPAuthConfig = {
      method: 'oauth',
      project_id: 'p1',
      oauth: {
        client_id: 'cid',
        client_secret: 'csec',
        refresh_token: 'rtok',
      },
    };

    const client = await get_gcp_credentials(cfg);

    expect(oauthCalls[0]).toEqual(['cid', 'csec']);
    expect(oauthInstances[0].setCredentials).toHaveBeenCalledWith({ refresh_token: 'rtok' });
    expect(client).toBe(oauthInstances[0]);
  });

  it('throws "Unknown auth method: <method>" for an unrecognized method', async () => {
    const { sdk } = makeSdk();
    sdkBag.load_sdk.mockResolvedValue(sdk);
    // Caller uses a runtime-typed method outside the union.
    const cfg = { method: 'mystery', project_id: 'p1' } as unknown as GCPAuthConfig;

    await expect(get_gcp_credentials(cfg)).rejects.toThrow(/Unknown auth method: mystery/);
  });
});

// =============================================================================
// validate_gcp_credentials
// =============================================================================

describe('validate_gcp_credentials', () => {
  it('returns valid:true with the client_email when getAccessToken returns a token', async () => {
    const { sdk } = makeSdk({
      credentials: { client_email: 'sa@p.iam.gserviceaccount.com' },
    });
    sdkBag.load_sdk.mockResolvedValue(sdk);

    const out = await validate_gcp_credentials({ method: 'adc', project_id: 'p1' });

    expect(out).toEqual({
      valid: true,
      email: 'sa@p.iam.gserviceaccount.com',
      project_id: 'p1',
    });
  });

  it('returns valid:false with COULD_NOT_OBTAIN_TOKEN when getAccessToken yields no token', async () => {
    const authClient = {
      getAccessToken: vi.fn().mockResolvedValue({ token: undefined }),
      request: vi.fn(),
    };
    const { sdk } = makeSdk({ authClient });
    sdkBag.load_sdk.mockResolvedValue(sdk);

    const out = await validate_gcp_credentials({ method: 'adc', project_id: 'p1' });

    expect(out).toEqual({
      valid: false,
      error: 'Could not obtain access token',
    });
  });

  it('returns valid:false when getAccessToken resolves to null entirely', async () => {
    // Probes the optional-chaining `token?.token` arm against a null
    // intermediate.
    const authClient = {
      getAccessToken: vi.fn().mockResolvedValue(null),
      request: vi.fn(),
    };
    const { sdk } = makeSdk({ authClient });
    sdkBag.load_sdk.mockResolvedValue(sdk);

    const out = await validate_gcp_credentials({ method: 'adc', project_id: 'p1' });

    expect(out.valid).toBe(false);
    expect(out.error).toBe('Could not obtain access token');
  });

  it('falls back to universe_domain when client_email is missing in credentials', async () => {
    const { sdk } = makeSdk({
      credentials: { universe_domain: 'googleapis.com' },
    });
    sdkBag.load_sdk.mockResolvedValue(sdk);

    const out = await validate_gcp_credentials({ method: 'adc', project_id: 'p1' });

    expect(out.email).toBe('googleapis.com');
  });

  it("falls back to 'authenticated' when neither client_email nor universe_domain is set", async () => {
    const { sdk } = makeSdk({ credentials: {} });
    sdkBag.load_sdk.mockResolvedValue(sdk);

    const out = await validate_gcp_credentials({ method: 'adc', project_id: 'p1' });

    expect(out.email).toBe('authenticated');
  });

  it("returns 'authenticated' when getCredentials() resolves to null", async () => {
    // `credentials?.client_email || credentials?.universe_domain || 'authenticated'`
    // — both optional chains short-circuit when credentials is nullish.
    const { sdk } = makeSdk({ credentials: null });
    sdkBag.load_sdk.mockResolvedValue(sdk);

    const out = await validate_gcp_credentials({ method: 'adc', project_id: 'p1' });

    expect(out.email).toBe('authenticated');
  });

  it('returns valid:false with the Error message when get_gcp_credentials throws', async () => {
    sdkBag.load_sdk.mockResolvedValue(null);

    const out = await validate_gcp_credentials({ method: 'adc', project_id: 'p1' });

    expect(out.valid).toBe(false);
    expect(out.error).toMatch(/google-auth-library not installed/);
  });

  it('uses String(error) when the thrown value is not an Error instance', async () => {
    // A non-Error throw inside getAccessToken exercises the
    // `error instanceof Error ? .message : String(error)` fallback.
    const authClient = {
      getAccessToken: vi.fn().mockRejectedValue('plain-string-throw'),
      request: vi.fn(),
    };
    const { sdk } = makeSdk({ authClient });
    sdkBag.load_sdk.mockResolvedValue(sdk);

    const out = await validate_gcp_credentials({ method: 'adc', project_id: 'p1' });

    expect(out.valid).toBe(false);
    expect(out.error).toBe('plain-string-throw');
  });
});

// =============================================================================
// list_gcp_projects
// =============================================================================

describe('list_gcp_projects', () => {
  it('returns a mapped array when the API responds with projects', async () => {
    const authClient = {
      getAccessToken: vi.fn().mockResolvedValue({ token: 't' }),
      request: vi.fn().mockResolvedValue({
        data: {
          projects: [
            { projectId: 'p1', name: 'Project One', projectNumber: '111' },
            { projectId: 'p2', name: 'Project Two', projectNumber: '222' },
          ],
        },
      }),
    };
    const { sdk } = makeSdk({ authClient });
    sdkBag.load_sdk.mockResolvedValue(sdk);

    const projects = await list_gcp_projects({ method: 'adc', project_id: 'p1' });

    expect(authClient.request).toHaveBeenCalledWith({
      url: 'https://cloudresourcemanager.googleapis.com/v1/projects?filter=lifecycleState%3AACTIVE',
    });
    expect(projects).toEqual([
      { id: 'p1', name: 'Project One', number: '111' },
      { id: 'p2', name: 'Project Two', number: '222' },
    ]);
  });

  it('returns an empty array when the API response has no projects field', async () => {
    const authClient = {
      getAccessToken: vi.fn().mockResolvedValue({ token: 't' }),
      // `data.projects || []` — undefined `projects` falls through to []
      request: vi.fn().mockResolvedValue({ data: {} }),
    };
    const { sdk } = makeSdk({ authClient });
    sdkBag.load_sdk.mockResolvedValue(sdk);

    const projects = await list_gcp_projects({ method: 'adc', project_id: 'p1' });

    expect(projects).toEqual([]);
  });

  it('returns an empty array when projects is an empty list', async () => {
    const authClient = {
      getAccessToken: vi.fn().mockResolvedValue({ token: 't' }),
      request: vi.fn().mockResolvedValue({ data: { projects: [] } }),
    };
    const { sdk } = makeSdk({ authClient });
    sdkBag.load_sdk.mockResolvedValue(sdk);

    const projects = await list_gcp_projects({ method: 'adc', project_id: 'p1' });

    expect(projects).toEqual([]);
  });

  it('returns an empty array when the underlying request throws', async () => {
    const authClient = {
      getAccessToken: vi.fn().mockResolvedValue({ token: 't' }),
      request: vi.fn().mockRejectedValue(new Error('PERMISSION_DENIED')),
    };
    const { sdk } = makeSdk({ authClient });
    sdkBag.load_sdk.mockResolvedValue(sdk);

    const projects = await list_gcp_projects({ method: 'adc', project_id: 'p1' });

    // The catch branch swallows errors and returns [].
    expect(projects).toEqual([]);
  });

  it('returns an empty array when the SDK is not available', async () => {
    // `get_gcp_credentials` throws inside the try; caught, returns [].
    sdkBag.load_sdk.mockResolvedValue(null);

    const projects = await list_gcp_projects({ method: 'adc', project_id: 'p1' });

    expect(projects).toEqual([]);
  });
});
