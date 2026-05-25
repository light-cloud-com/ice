/**
 * Tests for the AWS shared infra helpers — account-id resolver (STS)
 * and ensureManagedRole (IAM).
 *
 * Reuses the same Function-constructor stub the AWS deployer test
 * suite uses so the dynamic SDK imports resolve to controllable fakes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create_account_id_resolver } from '../aws/account';
import { ensureEcsTaskExecutionRole, ensureManagedRole } from '../aws/iam-roles';

// ─── Function-constructor stub (mirrors aws-deployer.test.ts) ───────

interface FakeImportRegistry {
  '@aws-sdk/client-sts'?: unknown;
  '@aws-sdk/client-iam'?: unknown;
}

const original_function = globalThis.Function;

function install_dynamic_import_stub(registry: FakeImportRegistry): void {
  const stub = function (...args: unknown[]) {
    if (args.length === 2 && args[0] === 'm' && typeof args[1] === 'string' && args[1].includes('return import')) {
      return (module_name: string) => {
        const mod = (registry as Record<string, unknown>)[module_name];
        if (mod === undefined) return Promise.reject(new Error(`Mocked module not registered: ${module_name}`));
        return Promise.resolve(mod);
      };
    }
    return (original_function as unknown as (...a: unknown[]) => unknown).apply(original_function, args);
  };
  (globalThis as { Function: unknown }).Function = stub;
}

function restore_dynamic_import_stub(): void {
  (globalThis as { Function: unknown }).Function = original_function;
}

// ─── Fake STS / IAM SDK shapes ─────────────────────────────────────

function makeStsModule(opts: { account?: string | null; throwOn?: 'send' } = {}) {
  const sendCalls: any[] = [];
  const send = vi.fn(async (cmd: any) => {
    sendCalls.push(cmd);
    if (opts.throwOn === 'send') throw new Error('STS exploded');
    // `null` opts.account → response with no Account field.
    if (opts.account === null) return {};
    return { Account: opts.account ?? '123456789012' };
  });
  const destroy = vi.fn();
  class STSClient {
    region: string;
    send: any;
    destroy: any;
    constructor(args: any) {
      this.region = args.region;
      this.send = send;
      this.destroy = destroy;
    }
  }
  class GetCallerIdentityCommand {
    input: any;
    constructor(input: any) {
      this.input = input;
    }
  }
  return { STSClient, GetCallerIdentityCommand, send, destroy, sendCalls };
}

function makeIamModule(opts: { getRoleArn?: string | null; createRoleArn?: string } = {}) {
  const sendCalls: any[] = [];
  const send = vi.fn(async (cmd: any) => {
    sendCalls.push(cmd);
    const name = cmd.__cmd;
    if (name === 'GetRole') {
      if (opts.getRoleArn === null) {
        const err: any = new Error('NoSuchEntity');
        err.name = 'NoSuchEntityException';
        throw err;
      }
      return { Role: { Arn: opts.getRoleArn ?? 'arn:aws:iam::1:role/existing' } };
    }
    if (name === 'CreateRole') return { Role: { Arn: opts.createRoleArn ?? 'arn:aws:iam::1:role/created' } };
    if (name === 'AttachRolePolicy') return {};
    return {};
  });
  const destroy = vi.fn();
  class IAMClient {
    region: string;
    send: any;
    destroy: any;
    constructor(args: any) {
      this.region = args.region;
      this.send = send;
      this.destroy = destroy;
    }
  }
  class GetRoleCommand {
    input: any;
    __cmd = 'GetRole';
    constructor(input: any) {
      this.input = input;
    }
  }
  class CreateRoleCommand {
    input: any;
    __cmd = 'CreateRole';
    constructor(input: any) {
      this.input = input;
    }
  }
  class AttachRolePolicyCommand {
    input: any;
    __cmd = 'AttachRolePolicy';
    constructor(input: any) {
      this.input = input;
    }
  }
  return { IAMClient, GetRoleCommand, CreateRoleCommand, AttachRolePolicyCommand, send, destroy, sendCalls };
}

beforeEach(() => {
  install_dynamic_import_stub({});
});
afterEach(() => {
  restore_dynamic_import_stub();
});

// ─── account-id resolver ────────────────────────────────────────────

describe('create_account_id_resolver', () => {
  it('returns the STS Account field on first call', async () => {
    const sts = makeStsModule({ account: '111122223333' });
    install_dynamic_import_stub({ '@aws-sdk/client-sts': sts });
    const resolve = create_account_id_resolver('us-east-1');
    expect(await resolve()).toBe('111122223333');
  });

  it('memoises — second call returns the cached value without re-hitting STS', async () => {
    const sts = makeStsModule({ account: '999999999999' });
    install_dynamic_import_stub({ '@aws-sdk/client-sts': sts });
    const resolve = create_account_id_resolver('us-east-1');
    expect(await resolve()).toBe('999999999999');
    expect(await resolve()).toBe('999999999999');
    expect(sts.send).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent first calls into one STS request', async () => {
    const sts = makeStsModule({ account: '555' });
    install_dynamic_import_stub({ '@aws-sdk/client-sts': sts });
    const resolve = create_account_id_resolver('us-east-1');
    const [a, b, c] = await Promise.all([resolve(), resolve(), resolve()]);
    expect(a).toBe('555');
    expect(b).toBe('555');
    expect(c).toBe('555');
    expect(sts.send).toHaveBeenCalledTimes(1);
  });

  it('throws a clear "install the SDK" message when STS is missing', async () => {
    install_dynamic_import_stub({});
    const resolve = create_account_id_resolver('us-east-1');
    await expect(resolve()).rejects.toThrow(/install @aws-sdk\/client-sts/);
  });

  it('throws when STS GetCallerIdentity returns no Account field', async () => {
    const sts = makeStsModule({ account: null });
    install_dynamic_import_stub({ '@aws-sdk/client-sts': sts });
    const resolve = create_account_id_resolver('us-east-1');
    await expect(resolve()).rejects.toThrow(/no Account field/);
  });
});

// ─── ensureManagedRole ──────────────────────────────────────────────

describe('ensureManagedRole', () => {
  const TRUST = JSON.stringify({ V: 1 });
  const ARN_POLICY = 'arn:aws:iam::aws:policy/Foo';

  it('returns the existing role ARN on the happy path (no CreateRole call)', async () => {
    const iam = makeIamModule({ getRoleArn: 'arn:aws:iam::1:role/existing' });
    install_dynamic_import_stub({ '@aws-sdk/client-iam': iam });
    const arn = await ensureManagedRole('us-east-1', 'my-role', TRUST, ARN_POLICY);
    expect(arn).toBe('arn:aws:iam::1:role/existing');
    // GetRole only, no CreateRole / AttachRolePolicy
    expect(iam.sendCalls.map((c: any) => c.__cmd)).toEqual(['GetRole']);
  });

  it('creates the role + attaches the managed policy on NoSuchEntity', async () => {
    const iam = makeIamModule({ getRoleArn: null, createRoleArn: 'arn:aws:iam::1:role/created' });
    install_dynamic_import_stub({ '@aws-sdk/client-iam': iam });
    const arn = await ensureManagedRole('us-east-1', 'new-role', TRUST, ARN_POLICY);
    expect(arn).toBe('arn:aws:iam::1:role/created');
    expect(iam.sendCalls.map((c: any) => c.__cmd)).toEqual(['GetRole', 'CreateRole', 'AttachRolePolicy']);
  });

  it('throws when IAM SDK is not installed', async () => {
    install_dynamic_import_stub({});
    await expect(ensureManagedRole('us-east-1', 'r', TRUST, ARN_POLICY)).rejects.toThrow(/@aws-sdk\/client-iam/);
  });
});

describe('ensureEcsTaskExecutionRole', () => {
  it('delegates to ensureManagedRole with the standard ECS trust + managed policy', async () => {
    const iam = makeIamModule({ getRoleArn: 'arn:aws:iam::1:role/ecsTaskExecutionRole' });
    install_dynamic_import_stub({ '@aws-sdk/client-iam': iam });
    const arn = await ensureEcsTaskExecutionRole('us-east-1');
    expect(arn).toBe('arn:aws:iam::1:role/ecsTaskExecutionRole');
    expect((iam.sendCalls[0] as any).input).toEqual({ RoleName: 'ecsTaskExecutionRole' });
  });
});
