/**
 * Shared test harness for Azure handler tests.
 *
 * Every handler in `providers/azure/handlers/` loads its SDK via the
 * `Function('m', 'return import(m)')` indirection — same trick AWS
 * uses. This harness installs a global Function stub that routes the
 * indirection through a controllable registry of fake SDK modules.
 *
 * Parallel to `_aws-test-harness.ts`.
 */

export interface AzureFakeImportRegistry {
  [module_name: string]: unknown;
}

const original_function = globalThis.Function;

/**
 * Install a Function-constructor stub that intercepts
 * `Function('m', 'return import(m)')(...)` calls and routes them
 * through the supplied registry instead of attempting a real import.
 *
 * Unregistered modules return `null` to match the real
 * `load_azure_sdk` fallback behaviour.
 */
export function install_dynamic_import_stub(registry: AzureFakeImportRegistry): void {
  const stub = function (...args: unknown[]) {
    if (args.length === 2 && args[0] === 'm' && typeof args[1] === 'string' && args[1].includes('return import')) {
      return (module_name: string) => {
        const mod = registry[module_name];
        // The real load_azure_sdk returns null on missing module; the
        // identity import goes through the same indirection but throws
        // — preserve that by rejecting only for identity.
        if (mod === undefined) {
          if (module_name === '@azure/identity') {
            return Promise.reject(new Error(`Mocked module not registered: ${module_name}`));
          }
          return Promise.resolve(null);
        }
        return Promise.resolve(mod);
      };
    }
    return (original_function as unknown as (...a: unknown[]) => unknown).apply(original_function, args);
  };
  (globalThis as { Function: unknown }).Function = stub;
}

export function restore_dynamic_import_stub(): void {
  (globalThis as { Function: unknown }).Function = original_function;
}

/**
 * Build a minimal `@azure/identity` mock — every Azure ARM client
 * constructor expects `(credential, subscription_id)` so the test
 * registry needs DefaultAzureCredential to instantiate cleanly.
 */
export function makeIdentityModule(): { DefaultAzureCredential: new () => unknown } {
  return { DefaultAzureCredential: class {} };
}

/**
 * Build a generic ARM management client mock. Each Azure SDK exposes a
 * top-level client class with one or more sub-clients (e.g.
 * `KeyVaultManagementClient.vaults`, `RedisManagementClient.redis`).
 * The factory takes the constructor name + a map of sub-client objects
 * and returns the module shape `load_azure_sdk` would resolve to.
 *
 * Example:
 *   makeArmModule('RedisManagementClient', { redis: redisOps })
 *   // -> { RedisManagementClient: class { redis = redisOps } }
 */
export function makeArmModule<T extends Record<string, unknown>>(
  client_class_name: string,
  sub_clients: T,
): Record<string, new () => T> {
  // Construct a class whose instance has the sub_clients attached.
  // Using `class extends` style preserves `new` semantics.
  const ClientClass = class {
    constructor() {
      Object.assign(this, sub_clients);
    }
  } as unknown as new () => T;
  return { [client_class_name]: ClientClass };
}
