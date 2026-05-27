/**
 * Tests for the Azure direct importer.
 *
 * The importer pulls in `@azure/identity` and `@azure/arm-resourcegraph`
 * via the `Function('m', 'return import(m)')` indirection, which bypasses
 * Vitest's module registry. We intercept by replacing `globalThis.Function`
 * for the duration of the test — the source pattern is
 *
 *     Function('m', 'return import(m)')(module_name)
 *
 * so a stub Function constructor that returns a controllable resolver
 * is the smallest hook that lets us inject a fake SDK.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { import_azure, import_azure_to_graph, azure_result_to_graph } from '../azure-importer';
import type { AzureImportResult, AzureImportedResource } from '../types';

// =============================================================================
// Function-constructor stub: intercepts `Function('m', 'return import(m)')`.
// =============================================================================

interface FakeImportRegistry {
  '@azure/identity'?: unknown;
  '@azure/arm-resourcegraph'?: unknown;
}

const original_function = globalThis.Function;

function install_dynamic_import_stub(registry: FakeImportRegistry): void {
  // The source builds a *new* Function on every call, so we can identify
  // the dynamic-import call by matching the body text.
  const stub = function (...args: unknown[]) {
    if (args.length === 2 && args[0] === 'm' && typeof args[1] === 'string' && args[1].includes('return import')) {
      // Return a function that resolves modules from the registry.
      return (module_name: string) => {
        const mod = (registry as Record<string, unknown>)[module_name];
        if (mod === undefined) {
          return Promise.reject(new Error(`Mocked module not registered: ${module_name}`));
        }
        return Promise.resolve(mod);
      };
    }
    // Fall through to the real Function constructor.
    return (original_function as unknown as (...a: unknown[]) => unknown).apply(original_function, args);
  };
  // The arms-length cast is needed because Function has both a constructor
  // and a callable signature.
  (globalThis as { Function: unknown }).Function = stub;
}

function restore_dynamic_import_stub(): void {
  (globalThis as { Function: unknown }).Function = original_function;
}

// Standard fake SDK: a credential class + a graph client whose `resources`
// method returns a single page of fake data, callable enough times to
// terminate pagination.
function build_default_fake_sdk(resources_response: { data?: unknown[]; skipToken?: string }): FakeImportRegistry {
  return {
    '@azure/identity': {
      DefaultAzureCredential: class {
        constructor() {}
      },
    },
    '@azure/arm-resourcegraph': {
      ResourceGraphClient: class {
        constructor(_credential: unknown) {}
        async resources(_query: unknown): Promise<unknown> {
          return resources_response;
        }
      },
    },
  };
}

// =============================================================================
// Lifecycle
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  restore_dynamic_import_stub();
});

// =============================================================================
// import_azure: SDK init failure path (no SDK packages installed)
// =============================================================================

describe('import_azure (no Azure SDK installed)', () => {
  it('returns an error result with success=false when SDK init fails', async () => {
    // No dynamic-import stub — the real Function will be used; the SDK packages
    // are not installed; the dynamic import rejects; init throws.
    const result = await import_azure();
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.resources).toEqual([]);
  });

  it('classifies the SDK init failure as an API_ERROR', async () => {
    const result = await import_azure();
    // The dynamic-import rejection is not Azure-shaped, so classifyAzureError
    // falls through to the default API_ERROR bucket.
    expect(result.errors[0]?.code).toBe('API_ERROR');
  });

  it('records empty subscriptions/locations in metadata when discovery never ran', async () => {
    const result = await import_azure();
    expect(result.metadata.subscriptions).toEqual([]);
    expect(result.metadata.locations).toEqual([]);
    expect(result.metadata.resource_count).toBe(0);
  });

  it('still includes a duration_ms and ISO imported_at timestamp', async () => {
    const before = Date.now();
    const result = await import_azure();
    expect(result.metadata.duration_ms).toBeGreaterThanOrEqual(0);
    expect(new Date(result.metadata.imported_at).getTime()).toBeGreaterThanOrEqual(before);
  });
});

// =============================================================================
// import_azure: resource discovery success path (mocked SDK)
// =============================================================================

describe('import_azure (mocked SDK, single page)', () => {
  it('imports each row in response.data as a resource', async () => {
    install_dynamic_import_stub(
      build_default_fake_sdk({
        data: [
          {
            id: '/subscriptions/sub-1/resourceGroups/rg-a/providers/Microsoft.Web/sites/site-a',
            name: 'site-a',
            type: 'Microsoft.Web/sites',
            location: 'eastus',
            resourceGroup: 'rg-a',
            subscriptionId: 'sub-1',
            properties: { hostName: 'a.example.com' },
            tags: { Env: 'prod' },
          },
        ],
      }),
    );

    const result = await import_azure();
    expect(result.success).toBe(true);
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]).toMatchObject({
      azure_id: '/subscriptions/sub-1/resourceGroups/rg-a/providers/Microsoft.Web/sites/site-a',
      azure_type: 'Microsoft.Web/sites',
      ice_type: 'azure.web.app',
      name: 'site-a',
      properties: { host_name: 'a.example.com' },
      provider: 'azure',
      subscription_id: 'sub-1',
      resource_group: 'rg-a',
      location: 'eastus',
      tags: { Env: 'prod' },
    });
  });

  it('records subscription and location once in metadata', async () => {
    install_dynamic_import_stub(
      build_default_fake_sdk({
        data: [
          {
            id: '/subscriptions/sub-1/.../site-a',
            name: 'site-a',
            type: 'Microsoft.Web/sites',
            location: 'eastus',
            resourceGroup: 'rg-a',
            subscriptionId: 'sub-1',
            properties: {},
          },
          {
            id: '/subscriptions/sub-1/.../site-b',
            name: 'site-b',
            type: 'Microsoft.Web/sites',
            location: 'eastus',
            resourceGroup: 'rg-a',
            subscriptionId: 'sub-1',
            properties: {},
          },
        ],
      }),
    );

    const result = await import_azure();
    expect(result.metadata.subscriptions).toEqual(['sub-1']);
    expect(result.metadata.locations).toEqual(['eastus']);
  });

  it('falls back to safe defaults for missing item fields', async () => {
    install_dynamic_import_stub(
      build_default_fake_sdk({
        // Items with no fields — exercises the `||` defaults.
        data: [{}],
      }),
    );

    const result = await import_azure();
    // Empty resource still imports, with all-empty defaults.
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]).toMatchObject({
      azure_id: '',
      azure_type: '',
      name: '',
      location: 'global',
      resource_group: '',
      subscription_id: '',
      tags: {},
    });
    // Location 'global' was added to the locations list.
    expect(result.metadata.locations).toEqual(['global']);
  });

  it('handles an undefined data array gracefully', async () => {
    install_dynamic_import_stub(build_default_fake_sdk({}));

    const result = await import_azure();
    expect(result.resources).toEqual([]);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// import_azure: pagination via skipToken
// =============================================================================

describe('import_azure (pagination)', () => {
  it('keeps fetching while skipToken is present', async () => {
    let call_count = 0;
    const registry: FakeImportRegistry = {
      '@azure/identity': {
        DefaultAzureCredential: class {},
      },
      '@azure/arm-resourcegraph': {
        ResourceGraphClient: class {
          constructor(_credential: unknown) {}
          async resources(query: { options?: Record<string, unknown> }): Promise<unknown> {
            call_count += 1;
            if (call_count === 1) {
              expect(query.options?.['$skipToken']).toBeUndefined();
              return {
                data: [
                  {
                    id: 'id-1',
                    name: 'r1',
                    type: 'Microsoft.Web/sites',
                    location: 'eastus',
                    resourceGroup: 'rg',
                    subscriptionId: 'sub',
                    properties: {},
                  },
                ],
                skipToken: 'next-page',
              };
            }
            // Second call should carry the skipToken from page 1.
            expect(query.options?.['$skipToken']).toBe('next-page');
            return {
              data: [
                {
                  id: 'id-2',
                  name: 'r2',
                  type: 'Microsoft.Web/sites',
                  location: 'eastus',
                  resourceGroup: 'rg',
                  subscriptionId: 'sub',
                  properties: {},
                },
              ],
            };
          }
        },
      },
    };
    install_dynamic_import_stub(registry);

    const result = await import_azure();
    expect(call_count).toBe(2);
    expect(result.resources.map((r) => r.name)).toEqual(['r1', 'r2']);
  });
});

// =============================================================================
// import_azure: filter, exclude, tag-match branches
// =============================================================================

describe('import_azure (filters)', () => {
  function fake_sdk_with_two(): FakeImportRegistry {
    return build_default_fake_sdk({
      data: [
        {
          id: 'id-1',
          name: 'site-a',
          type: 'Microsoft.Web/sites',
          location: 'eastus',
          resourceGroup: 'rg',
          subscriptionId: 'sub',
          properties: {},
          tags: { Env: 'prod' },
        },
        {
          id: 'id-2',
          name: 'redis-a',
          type: 'Microsoft.Cache/Redis',
          location: 'eastus',
          resourceGroup: 'rg',
          subscriptionId: 'sub',
          properties: {},
          tags: { Env: 'dev' },
        },
      ],
    });
  }

  it('keeps only resources whose ice_type is in filter_types', async () => {
    install_dynamic_import_stub(fake_sdk_with_two());
    const result = await import_azure({ filter_types: ['azure.web.app'] });
    expect(result.resources.map((r) => r.ice_type)).toEqual(['azure.web.app']);
  });

  it('drops resources whose ice_type is in exclude_types', async () => {
    install_dynamic_import_stub(fake_sdk_with_two());
    const result = await import_azure({ exclude_types: ['azure.cache.redis'] });
    expect(result.resources.map((r) => r.ice_type)).toEqual(['azure.web.app']);
  });

  it('keeps only resources whose tags include all filter_tags entries', async () => {
    install_dynamic_import_stub(fake_sdk_with_two());
    const result = await import_azure({ filter_tags: { Env: 'prod' } });
    expect(result.resources.map((r) => r.name)).toEqual(['site-a']);
  });

  it('treats a missing tag as a non-match', async () => {
    install_dynamic_import_stub(
      build_default_fake_sdk({
        data: [
          {
            id: 'id-1',
            name: 'no-tag-resource',
            type: 'Microsoft.Web/sites',
            location: 'eastus',
            resourceGroup: 'rg',
            subscriptionId: 'sub',
            properties: {},
            // tags omitted → resource.tags?.[key] is undefined
          },
        ],
      }),
    );
    const result = await import_azure({ filter_tags: { Env: 'prod' } });
    expect(result.resources).toEqual([]);
  });

  it('does not apply filter_types when the option is empty', async () => {
    install_dynamic_import_stub(fake_sdk_with_two());
    const result = await import_azure({ filter_types: [] });
    expect(result.resources).toHaveLength(2);
  });
});

// =============================================================================
// import_azure: query options (subscriptions, resource_groups)
// =============================================================================

describe('import_azure (query options)', () => {
  it('passes the subscriptions list to the resource graph query when supplied', async () => {
    let captured: Record<string, unknown> | undefined;
    install_dynamic_import_stub({
      '@azure/identity': { DefaultAzureCredential: class {} },
      '@azure/arm-resourcegraph': {
        ResourceGraphClient: class {
          async resources(query: Record<string, unknown>): Promise<unknown> {
            captured = query;
            return { data: [] };
          }
        },
      },
    });

    await import_azure({ subscriptions: ['sub-1', 'sub-2'] });
    expect(captured?.subscriptions).toEqual(['sub-1', 'sub-2']);
  });

  it('embeds resource_groups into the Kusto query string', async () => {
    let captured: Record<string, unknown> | undefined;
    install_dynamic_import_stub({
      '@azure/identity': { DefaultAzureCredential: class {} },
      '@azure/arm-resourcegraph': {
        ResourceGraphClient: class {
          async resources(query: Record<string, unknown>): Promise<unknown> {
            captured = query;
            return { data: [] };
          }
        },
      },
    });

    await import_azure({ resource_groups: ['rg-prod', 'rg-staging'] });
    expect(captured?.query).toMatch(/where resourceGroup in~ \("rg-prod", "rg-staging"\)/);
  });

  it('skips the resource_groups clause when the array is empty', async () => {
    let captured: Record<string, unknown> | undefined;
    install_dynamic_import_stub({
      '@azure/identity': { DefaultAzureCredential: class {} },
      '@azure/arm-resourcegraph': {
        ResourceGraphClient: class {
          async resources(query: Record<string, unknown>): Promise<unknown> {
            captured = query;
            return { data: [] };
          }
        },
      },
    });

    await import_azure({ resource_groups: [] });
    expect(captured?.query).not.toContain('where resourceGroup');
  });

  it('skips the subscriptions option when the array is empty', async () => {
    let captured: Record<string, unknown> | undefined;
    install_dynamic_import_stub({
      '@azure/identity': { DefaultAzureCredential: class {} },
      '@azure/arm-resourcegraph': {
        ResourceGraphClient: class {
          async resources(query: Record<string, unknown>): Promise<unknown> {
            captured = query;
            return { data: [] };
          }
        },
      },
    });

    await import_azure({ subscriptions: [] });
    expect(captured?.subscriptions).toBeUndefined();
  });

  it('drops undefined option values when merging with defaults', async () => {
    install_dynamic_import_stub(build_default_fake_sdk({ data: [] }));
    // Passing infer_dependencies: undefined should still pick up the
    // default (true) — exercises the Object.fromEntries undefined filter.
    const result = await import_azure({ infer_dependencies: undefined });
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// import_azure: SDK init thrown errors with auth-shape and non-Error throws
// =============================================================================

describe('import_azure (init_azure_sdk error variants)', () => {
  it('attaches an action when SDK init wraps an auth-marker substring', async () => {
    // The SDK init wraps the underlying error message into its own. If the
    // underlying message includes 'AADSTS' (Azure auth marker), the wrapped
    // message inherits it — and classifyAzureError then returns a reauth
    // action. This exercises the action-truthy branch in the outer catch.
    const stub = function (...args: unknown[]) {
      if (args.length === 2 && args[0] === 'm' && typeof args[1] === 'string' && args[1].includes('return import')) {
        return () => Promise.reject(new Error('AADSTS50076: token has expired'));
      }
      return (original_function as unknown as (...a: unknown[]) => unknown).apply(original_function, args);
    };
    (globalThis as { Function: unknown }).Function = stub;

    const result = await import_azure();
    expect(result.errors[0]?.code).toBe('AUTH_REAUTH_REQUIRED');
    expect(result.errors[0]?.action).toBe('reauth');
    expect(result.errors[0]?.command).toBe('az login');
  });

  it('serializes a non-Error throw via String() in the SDK init error message', async () => {
    // Throw a non-Error literal to exercise the String(error) branch on line 264.
    const stub = function (...args: unknown[]) {
      if (args.length === 2 && args[0] === 'm' && typeof args[1] === 'string' && args[1].includes('return import')) {
        // The init code awaits the function we return — throw a string here so the
        // thrown value is `'opaque-sdk-failure'` rather than an Error instance.
        return () => {
          throw 'opaque-sdk-failure';
        };
      }
      return (original_function as unknown as (...a: unknown[]) => unknown).apply(original_function, args);
    };
    (globalThis as { Function: unknown }).Function = stub;

    const result = await import_azure();
    // The outer wrap message embeds String(error) — confirm it bubbles up.
    expect(result.errors[0]?.message).toContain('opaque-sdk-failure');
  });
});

// =============================================================================
// import_azure: resource-graph-level error classification
// =============================================================================

describe('import_azure (resource graph errors)', () => {
  it('classifies a 403 Forbidden as AUTH_INSUFFICIENT_PERMISSIONS', async () => {
    install_dynamic_import_stub({
      '@azure/identity': { DefaultAzureCredential: class {} },
      '@azure/arm-resourcegraph': {
        ResourceGraphClient: class {
          async resources(): Promise<unknown> {
            throw { code: 'AuthorizationFailed', statusCode: 403, message: 'forbidden' };
          }
        },
      },
    });

    const result = await import_azure();
    expect(result.success).toBe(false);
    expect(result.errors[0]?.code).toBe('AUTH_INSUFFICIENT_PERMISSIONS');
  });

  it('classifies TooManyRequests / 429 as API_RATE_LIMITED with retry action', async () => {
    install_dynamic_import_stub({
      '@azure/identity': { DefaultAzureCredential: class {} },
      '@azure/arm-resourcegraph': {
        ResourceGraphClient: class {
          async resources(): Promise<unknown> {
            throw { code: 'TooManyRequests', statusCode: 429, message: 'slow down' };
          }
        },
      },
    });

    const result = await import_azure();
    expect(result.errors[0]?.code).toBe('API_RATE_LIMITED');
    expect(result.errors[0]?.action).toBe('retry');
  });

  it('falls through to API_ERROR when the failure does not match any classifier branch', async () => {
    install_dynamic_import_stub({
      '@azure/identity': { DefaultAzureCredential: class {} },
      '@azure/arm-resourcegraph': {
        ResourceGraphClient: class {
          async resources(): Promise<unknown> {
            throw { message: 'generic' };
          }
        },
      },
    });

    const result = await import_azure();
    expect(result.errors[0]?.code).toBe('API_ERROR');
  });
});

// =============================================================================
// import_azure: dependency inference branch
// =============================================================================

describe('import_azure (dependency inference)', () => {
  it('infers a dependency when one resource references another by Azure ID', async () => {
    const id_a = '/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/serverfarms/plan-a';
    const id_b = '/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/sites/site-b';
    install_dynamic_import_stub(
      build_default_fake_sdk({
        data: [
          {
            id: id_a,
            name: 'plan-a',
            type: 'Microsoft.Web/serverfarms',
            location: 'eastus',
            resourceGroup: 'rg',
            subscriptionId: 'sub-1',
            properties: {},
          },
          {
            id: id_b,
            name: 'site-b',
            type: 'Microsoft.Web/sites',
            location: 'eastus',
            resourceGroup: 'rg',
            subscriptionId: 'sub-1',
            properties: { serverFarmId: id_a },
          },
        ],
      }),
    );

    const result = await import_azure();
    const site = result.resources.find((r) => r.name === 'site-b');
    expect(site?.dependencies).toEqual([id_a]);
  });

  it('descends into arrays of strings when looking for IDs', async () => {
    const id_a = '/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/serverfarms/plan-a';
    const id_b = '/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/sites/site-b';
    install_dynamic_import_stub(
      build_default_fake_sdk({
        data: [
          {
            id: id_a,
            name: 'plan-a',
            type: 'Microsoft.Web/serverfarms',
            location: 'eastus',
            resourceGroup: 'rg',
            subscriptionId: 'sub-1',
            properties: {},
          },
          {
            id: id_b,
            name: 'site-b',
            type: 'Microsoft.Web/sites',
            location: 'eastus',
            resourceGroup: 'rg',
            subscriptionId: 'sub-1',
            properties: { references: [id_a] },
          },
        ],
      }),
    );

    const result = await import_azure();
    const site = result.resources.find((r) => r.name === 'site-b');
    expect(site?.dependencies).toEqual([id_a]);
  });

  it('descends into nested objects', async () => {
    const id_a = '/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/serverfarms/plan-a';
    const id_b = '/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/sites/site-b';
    install_dynamic_import_stub(
      build_default_fake_sdk({
        data: [
          {
            id: id_a,
            name: 'plan-a',
            type: 'Microsoft.Web/serverfarms',
            location: 'eastus',
            resourceGroup: 'rg',
            subscriptionId: 'sub-1',
            properties: {},
          },
          {
            id: id_b,
            name: 'site-b',
            type: 'Microsoft.Web/sites',
            location: 'eastus',
            resourceGroup: 'rg',
            subscriptionId: 'sub-1',
            properties: { config: { plan: { ref: id_a } } },
          },
        ],
      }),
    );

    const result = await import_azure();
    const site = result.resources.find((r) => r.name === 'site-b');
    expect(site?.dependencies).toEqual([id_a]);
  });

  it('does not include a self-reference in the dependency list', async () => {
    const id = '/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/sites/self-ref';
    install_dynamic_import_stub(
      build_default_fake_sdk({
        data: [
          {
            id,
            name: 'self-ref',
            type: 'Microsoft.Web/sites',
            location: 'eastus',
            resourceGroup: 'rg',
            subscriptionId: 'sub-1',
            properties: { selfRef: id },
          },
        ],
      }),
    );

    const result = await import_azure();
    expect(result.resources[0]?.dependencies).toEqual([]);
  });

  it('dedupes repeated references to the same resource', async () => {
    const id_a = '/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/serverfarms/plan-a';
    const id_b = '/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/sites/site-b';
    install_dynamic_import_stub(
      build_default_fake_sdk({
        data: [
          {
            id: id_a,
            name: 'plan-a',
            type: 'Microsoft.Web/serverfarms',
            location: 'eastus',
            resourceGroup: 'rg',
            subscriptionId: 'sub-1',
            properties: {},
          },
          {
            id: id_b,
            name: 'site-b',
            type: 'Microsoft.Web/sites',
            location: 'eastus',
            resourceGroup: 'rg',
            subscriptionId: 'sub-1',
            properties: { a: id_a, b: id_a },
          },
        ],
      }),
    );

    const result = await import_azure();
    const site = result.resources.find((r) => r.name === 'site-b');
    expect(site?.dependencies).toEqual([id_a]);
  });

  it('ignores /subscriptions/ strings whose target is not in the import set', async () => {
    install_dynamic_import_stub(
      build_default_fake_sdk({
        data: [
          {
            id: '/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/sites/site-b',
            name: 'site-b',
            type: 'Microsoft.Web/sites',
            location: 'eastus',
            resourceGroup: 'rg',
            subscriptionId: 'sub-1',
            properties: { ref: '/subscriptions/sub-1/.../missing-resource' },
          },
        ],
      }),
    );
    const result = await import_azure();
    expect(result.resources[0]?.dependencies).toEqual([]);
  });

  it('ignores non-/subscriptions/ strings entirely', async () => {
    install_dynamic_import_stub(
      build_default_fake_sdk({
        data: [
          {
            id: '/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/sites/site',
            name: 'site',
            type: 'Microsoft.Web/sites',
            location: 'eastus',
            resourceGroup: 'rg',
            subscriptionId: 'sub-1',
            properties: { name: 'plain text', region: 'eastus' },
          },
        ],
      }),
    );
    const result = await import_azure();
    expect(result.resources[0]?.dependencies).toEqual([]);
  });

  it('treats null property values as no-ops during ID scanning', async () => {
    // The find_ids walker checks `obj && typeof obj === 'object'` — null
    // values short-circuit to skip recursion. This exercises that branch.
    install_dynamic_import_stub(
      build_default_fake_sdk({
        data: [
          {
            id: '/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/sites/site',
            name: 'site',
            type: 'Microsoft.Web/sites',
            location: 'eastus',
            resourceGroup: 'rg',
            subscriptionId: 'sub-1',
            properties: { nullField: null, numberField: 42, undefField: undefined },
          },
        ],
      }),
    );
    const result = await import_azure();
    expect(result.resources[0]?.dependencies).toEqual([]);
  });

  it('skips dependency inference when infer_dependencies is false', async () => {
    const id_a = '/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/serverfarms/plan-a';
    const id_b = '/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/sites/site-b';
    install_dynamic_import_stub(
      build_default_fake_sdk({
        data: [
          {
            id: id_a,
            name: 'plan-a',
            type: 'Microsoft.Web/serverfarms',
            location: 'eastus',
            resourceGroup: 'rg',
            subscriptionId: 'sub-1',
            properties: {},
          },
          {
            id: id_b,
            name: 'site-b',
            type: 'Microsoft.Web/sites',
            location: 'eastus',
            resourceGroup: 'rg',
            subscriptionId: 'sub-1',
            properties: { ref: id_a },
          },
        ],
      }),
    );

    const result = await import_azure({ infer_dependencies: false });
    const site = result.resources.find((r) => r.name === 'site-b');
    expect(site?.dependencies).toEqual([]);
  });
});

// =============================================================================
// azure_result_to_graph: pure conversion
// =============================================================================

function make_imported_resource(overrides: Partial<AzureImportedResource> = {}): AzureImportedResource {
  return {
    azure_id: '/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/sites/r',
    azure_type: 'Microsoft.Web/sites',
    ice_type: 'azure.web.app',
    name: 'r',
    properties: {},
    dependencies: [],
    provider: 'azure',
    subscription_id: 'sub-1',
    resource_group: 'rg',
    location: 'eastus',
    tags: {},
    ...overrides,
  };
}

function make_result(
  resources: AzureImportedResource[] = [],
  metadata_overrides: Partial<AzureImportResult['metadata']> = {},
): AzureImportResult {
  return {
    success: true,
    resources,
    errors: [],
    warnings: [],
    metadata: {
      subscriptions: ['sub-1'],
      locations: ['eastus'],
      resource_count: resources.length,
      imported_at: '2026-05-02T00:00:00.000Z',
      duration_ms: 0,
      ...metadata_overrides,
    },
  };
}

describe('azure_result_to_graph', () => {
  it('uses the default graph name when none is supplied', () => {
    const graph = azure_result_to_graph(make_result());
    expect(graph.name).toBe('azure-import');
  });

  it('uses a custom graph name when provided', () => {
    const graph = azure_result_to_graph(make_result(), 'my-azure');
    expect(graph.name).toBe('my-azure');
  });

  it('encodes scanned subscriptions in the graph description', () => {
    const graph = azure_result_to_graph(make_result([], { subscriptions: ['sub-1', 'sub-2'] }));
    expect(graph.metadata.description).toContain('sub-1, sub-2');
  });

  it('attaches source=azure as a graph-level label', () => {
    const graph = azure_result_to_graph(make_result());
    expect(graph.metadata.labels).toMatchObject({ source: 'azure' });
  });

  it('emits one node per resource with Azure metadata in properties', () => {
    const graph = azure_result_to_graph(make_result([make_imported_resource()]));
    expect(graph.nodes.size).toBe(1);
    const node = Array.from(graph.nodes.values())[0]!;
    expect(node.type).toBe('azure.web.app');
    expect(node.properties._azure_id).toBe('/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/sites/r');
    expect(node.properties._azure_type).toBe('Microsoft.Web/sites');
  });

  it('attaches provider/azure_type/subscription/location labels per node', () => {
    const graph = azure_result_to_graph(make_result([make_imported_resource()]));
    const node = Array.from(graph.nodes.values())[0]!;
    expect(node.metadata.labels).toMatchObject({
      provider: 'azure',
      azure_type: 'Microsoft.Web/sites',
      subscription_id: 'sub-1',
      resource_group: 'rg',
      location: 'eastus',
    });
  });

  it('spreads resource tags into labels', () => {
    const graph = azure_result_to_graph(
      make_result([make_imported_resource({ tags: { Env: 'prod', Owner: 'team-a' } })]),
    );
    const node = Array.from(graph.nodes.values())[0]!;
    expect(node.metadata.labels.Env).toBe('prod');
    expect(node.metadata.labels.Owner).toBe('team-a');
  });

  it('Azure-canonical labels are overwritten by tags with the same key', () => {
    // tags spread last in the source — tag wins on collision
    const graph = azure_result_to_graph(make_result([make_imported_resource({ tags: { location: 'fake-region' } })]));
    const node = Array.from(graph.nodes.values())[0]!;
    expect(node.metadata.labels.location).toBe('fake-region');
  });

  it('attaches imported_from / azure_id / azure_subscription annotations', () => {
    const graph = azure_result_to_graph(make_result([make_imported_resource()]));
    const node = Array.from(graph.nodes.values())[0]!;
    expect(node.metadata.annotations).toMatchObject({
      imported_from: 'azure',
      azure_id: '/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/sites/r',
      azure_subscription: 'sub-1',
    });
  });

  it('emits an inferred + source-tagged depends_on edge per dependency', () => {
    const a = make_imported_resource({
      azure_id: '/subscriptions/sub-1/.../a',
      name: 'a',
      dependencies: ['/subscriptions/sub-1/.../b'],
    });
    const b = make_imported_resource({
      azure_id: '/subscriptions/sub-1/.../b',
      name: 'b',
    });
    const graph = azure_result_to_graph(make_result([a, b]));
    expect(graph.edges.size).toBe(1);
    const edge = Array.from(graph.edges.values())[0]!;
    expect(edge.relationship).toBe('depends_on');
    expect(edge.metadata.labels.inferred).toBe('true');
    expect(edge.metadata.labels.source).toBe('azure');
  });

  it('skips edges where the target is not in the graph', () => {
    const a = make_imported_resource({
      dependencies: ['/subscriptions/sub-1/.../missing'],
    });
    const graph = azure_result_to_graph(make_result([a]));
    expect(graph.edges.size).toBe(0);
  });

  it('skips self-dependency edges', () => {
    const id = '/subscriptions/sub-1/.../self';
    const a = make_imported_resource({
      azure_id: id,
      dependencies: [id],
    });
    const graph = azure_result_to_graph(make_result([a]));
    expect(graph.edges.size).toBe(0);
  });

  it('skips dependency edge emission when source resource was not added to the graph', () => {
    // Inject a duplicate resource whose add_node will fail (same name+type).
    // The first add succeeds; the second should be skipped due to !id_to_node_id
    // mapping being set only on successful adds. The key is asserting that the
    // outer `if (!source_id) continue;` path is still safe — no crash.
    const a = make_imported_resource({
      azure_id: '/subscriptions/sub-1/.../a',
      name: 'dup',
    });
    const b = make_imported_resource({
      azure_id: '/subscriptions/sub-1/.../b',
      name: 'dup',
      dependencies: ['/subscriptions/sub-1/.../a'],
    });
    const graph = azure_result_to_graph(make_result([a, b]));
    // Whether the graph dedupes by name+type or not, the function must not throw.
    expect(graph.nodes.size).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// import_azure_to_graph: wraps both steps
// =============================================================================

describe('import_azure_to_graph', () => {
  it('returns both the graph and the underlying result, using SDK error path when SDK is missing', async () => {
    const { graph, result } = await import_azure_to_graph();
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(graph.name).toBe('azure-import');
    expect(graph.nodes.size).toBe(0);
  });

  it('respects a custom graph name', async () => {
    const { graph } = await import_azure_to_graph({}, 'custom-graph');
    expect(graph.name).toBe('custom-graph');
  });

  it('end-to-end with mocked SDK resources produces a populated graph', async () => {
    install_dynamic_import_stub(
      build_default_fake_sdk({
        data: [
          {
            id: '/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/sites/site-x',
            name: 'site-x',
            type: 'Microsoft.Web/sites',
            location: 'eastus',
            resourceGroup: 'rg',
            subscriptionId: 'sub-1',
            properties: {},
          },
        ],
      }),
    );
    const { graph, result } = await import_azure_to_graph();
    expect(result.success).toBe(true);
    expect(graph.nodes.size).toBe(1);
  });
});
