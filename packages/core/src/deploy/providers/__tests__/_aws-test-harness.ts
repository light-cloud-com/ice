/**
 * Shared test harness for AWS handler tests.
 *
 * Every handler in `providers/aws/handlers/` loads its SDK via the
 * `Function('m', 'return import(m)')` indirection that Vitest's
 * module registry doesn't see. This harness installs a global
 * Function stub that routes the indirection through a controllable
 * registry of fake SDK modules, plus a generic factory for building
 * those fakes with arbitrary command-class shapes.
 *
 * See `aws-deployer.test.ts` (the original consumer) for the
 * inspiration; the harness below is the deduplicated form so each
 * per-handler test file stays small.
 */

import { vi } from 'vitest';

// =============================================================================
// Function-constructor stub
// =============================================================================

export interface AwsFakeImportRegistry {
  [module_name: string]: unknown;
}

const original_function = globalThis.Function;

export function install_dynamic_import_stub(registry: AwsFakeImportRegistry): void {
  const stub = function (...args: unknown[]) {
    if (args.length === 2 && args[0] === 'm' && typeof args[1] === 'string' && args[1].includes('return import')) {
      return (module_name: string) => {
        const mod = registry[module_name];
        if (mod === undefined) return Promise.reject(new Error(`Mocked module not registered: ${module_name}`));
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

// =============================================================================
// Generic AWS SDK mock factory
// =============================================================================

export interface SdkMockOptions {
  /** Name of the SDK's client constructor (`'S3Client'`, `'RDSClient'`, …). */
  client_class_name: string;
  /** Command class names — each gets a real class so `new X(input)` works. */
  command_class_names: string[];
  /**
   * Default behaviour for `client.send(cmd)`. Defaults to returning
   * `{}`. Override per command via `sendImpl`.
   */
  sendImpl?: (cmd: { __cmd: string; input: any }) => unknown | Promise<unknown>;
}

export interface SdkMock {
  send: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  sendCalls: Array<{ __cmd: string; input: any }>;
  /** Indexable bag of constructors so callers can pull commands out by name. */
  module: Record<string, unknown>;
}

/**
 * Build a fake AWS SDK module with a constructor-based client + a
 * matching set of command classes. Use this for handlers that need
 * just a few SDK commands without writing a bespoke factory.
 */
export function makeSdkMock(opts: SdkMockOptions): SdkMock {
  const sendCalls: Array<{ __cmd: string; input: any }> = [];
  const send = vi.fn(async (cmd: any) => {
    sendCalls.push(cmd);
    if (opts.sendImpl) return opts.sendImpl(cmd);
    return {};
  });
  const destroy = vi.fn();

  // Build the client constructor (named exactly `opts.client_class_name`).
  // The handler indexes the module by this name.
  const Client = class {
    region: string;
    send: any;
    destroy: any;
    constructor(args: any) {
      this.region = args?.region;
      this.send = send;
      this.destroy = destroy;
    }
  };
  Object.defineProperty(Client, 'name', { value: opts.client_class_name });

  const module: Record<string, unknown> = { [opts.client_class_name]: Client };
  for (const cmdName of opts.command_class_names) {
    // Tests assert via `sendCalls[i].__cmd === 'CreateX'` — strip the
    // 'Command' suffix so the label matches the operation name AWS
    // documents (`CreateSecret`, not `CreateSecretCommand`).
    const cmdLabel = cmdName.endsWith('Command') ? cmdName.slice(0, -'Command'.length) : cmdName;
    const Cmd = class {
      input: any;
      __cmd = cmdLabel;
      constructor(input: any) {
        this.input = input;
      }
    };
    Object.defineProperty(Cmd, 'name', { value: cmdName });
    module[cmdName] = Cmd;
  }

  return { send, destroy, sendCalls, module };
}

// =============================================================================
// STS mock — shared across every handler that touches account-id resolution
// =============================================================================

export const FAKE_ACCOUNT_ID = '000000000000';

export function makeStsMock(account?: string): SdkMock {
  const mock = makeSdkMock({
    client_class_name: 'STSClient',
    command_class_names: ['GetCallerIdentityCommand'],
    sendImpl: () => ({ Account: account ?? FAKE_ACCOUNT_ID }),
  });
  return mock;
}
