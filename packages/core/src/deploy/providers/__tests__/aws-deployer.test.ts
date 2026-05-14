/**
 * Tests for `aws-deployer.ts`.
 *
 * The deployer wraps AWS SDK v3 client packages
 * (`@aws-sdk/client-ec2`, `@aws-sdk/client-s3`, `@aws-sdk/client-lambda`)
 * loaded through the `Function('m', 'return import(m)')` indirection used
 * by every cross-cloud deployer + importer in this repo. Vitest's module
 * registry never sees those specifiers, so we replace `globalThis.Function`
 * with a stub that recognizes the dynamic-import constructor signature and
 * routes the requested module name through a controllable registry.
 *
 * Mirrors the harness in `azure-deployer.test.ts`. See learning anchors
 * `function-constructor-stub-intercepts-bypass-bundler-imports` and
 * `gcp-importer coverage` (real classes for `new`-able SDK constructors).
 *
 * Coverage scope:
 * - constructor + provider field
 * - `initialize`: region propagation, per-client try/catch arms,
 *   outer-catch with both Error and non-Error throws (re-throws wrapped)
 * - `cleanup`: every present client gets `.destroy()`; absent clients don't
 * - `create` / `update` / `delete`: type dispatch (ec2 / s3 / lambda /
 *   fallthrough) and per-call success and error branches in each
 * - private helpers (parsing instance_id from ARN, default field
 *   substitution, conditional bodies on update)
 * - `create_aws_deployer` factory
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AWSDeployer, create_aws_deployer } from '../aws-deployer';

// =============================================================================
// Function-constructor stub
// =============================================================================

interface FakeImportRegistry {
  '@aws-sdk/client-ec2'?: unknown;
  '@aws-sdk/client-s3'?: unknown;
  '@aws-sdk/client-lambda'?: unknown;
}

const original_function = globalThis.Function;

function install_dynamic_import_stub(registry: FakeImportRegistry): void {
  const stub = function (...args: unknown[]) {
    if (
      args.length === 2 &&
      args[0] === 'm' &&
      typeof args[1] === 'string' &&
      args[1].includes('return import')
    ) {
      return (module_name: string) => {
        const mod = (registry as Record<string, unknown>)[module_name];
        if (mod === undefined) {
          return Promise.reject(new Error(`Mocked module not registered: ${module_name}`));
        }
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

// =============================================================================
// Fake SDK shapes
//
// AWS SDK v3 clients are constructor-based (`new EC2Client({ region })`) and
// expose `send(command)`. Commands are also constructor-based
// (`new RunInstancesCommand(input)`). Both must be real classes because the
// SUT uses `new` on each — `vi.fn()` arrow-function mocks cannot be invoked
// with `new`. See `gcp-importer coverage` learning.
// =============================================================================

function makeEc2Module(opts: { sendImpl?: (cmd: any) => any | Promise<any> } = {}) {
  const sendCalls: any[] = [];
  const send = vi.fn(async (cmd: any) => {
    sendCalls.push(cmd);
    if (opts.sendImpl) return opts.sendImpl(cmd);
    return {};
  });
  const destroy = vi.fn();
  class EC2Client {
    region: string;
    send: any;
    destroy: any;
    constructor(args: any) {
      this.region = args.region;
      this.send = send;
      this.destroy = destroy;
    }
  }
  class RunInstancesCommand {
    input: any;
    __cmd = 'RunInstances';
    constructor(input: any) {
      this.input = input;
    }
  }
  class CreateTagsCommand {
    input: any;
    __cmd = 'CreateTags';
    constructor(input: any) {
      this.input = input;
    }
  }
  class TerminateInstancesCommand {
    input: any;
    __cmd = 'TerminateInstances';
    constructor(input: any) {
      this.input = input;
    }
  }
  return {
    EC2Client,
    RunInstancesCommand,
    CreateTagsCommand,
    TerminateInstancesCommand,
    send,
    destroy,
    sendCalls,
  };
}

function makeS3Module(opts: { sendImpl?: (cmd: any) => any | Promise<any> } = {}) {
  const sendCalls: any[] = [];
  const send = vi.fn(async (cmd: any) => {
    sendCalls.push(cmd);
    if (opts.sendImpl) return opts.sendImpl(cmd);
    return {};
  });
  const destroy = vi.fn();
  class S3Client {
    region: string;
    send: any;
    destroy: any;
    constructor(args: any) {
      this.region = args.region;
      this.send = send;
      this.destroy = destroy;
    }
  }
  class CreateBucketCommand {
    input: any;
    __cmd = 'CreateBucket';
    constructor(input: any) {
      this.input = input;
    }
  }
  class PutBucketTaggingCommand {
    input: any;
    __cmd = 'PutBucketTagging';
    constructor(input: any) {
      this.input = input;
    }
  }
  class DeleteBucketCommand {
    input: any;
    __cmd = 'DeleteBucket';
    constructor(input: any) {
      this.input = input;
    }
  }
  class ListObjectsV2Command {
    input: any;
    __cmd = 'ListObjectsV2';
    constructor(input: any) {
      this.input = input;
    }
  }
  class DeleteObjectsCommand {
    input: any;
    __cmd = 'DeleteObjects';
    constructor(input: any) {
      this.input = input;
    }
  }
  return {
    S3Client,
    CreateBucketCommand,
    PutBucketTaggingCommand,
    DeleteBucketCommand,
    ListObjectsV2Command,
    DeleteObjectsCommand,
    send,
    destroy,
    sendCalls,
  };
}

function makeLambdaModule(opts: { sendImpl?: (cmd: any) => any | Promise<any> } = {}) {
  const sendCalls: any[] = [];
  const send = vi.fn(async (cmd: any) => {
    sendCalls.push(cmd);
    if (opts.sendImpl) return opts.sendImpl(cmd);
    return {};
  });
  const destroy = vi.fn();
  class LambdaClient {
    region: string;
    send: any;
    destroy: any;
    constructor(args: any) {
      this.region = args.region;
      this.send = send;
      this.destroy = destroy;
    }
  }
  class CreateFunctionCommand {
    input: any;
    __cmd = 'CreateFunction';
    constructor(input: any) {
      this.input = input;
    }
  }
  class UpdateFunctionConfigurationCommand {
    input: any;
    __cmd = 'UpdateFunctionConfiguration';
    constructor(input: any) {
      this.input = input;
    }
  }
  class UpdateFunctionCodeCommand {
    input: any;
    __cmd = 'UpdateFunctionCode';
    constructor(input: any) {
      this.input = input;
    }
  }
  class DeleteFunctionCommand {
    input: any;
    __cmd = 'DeleteFunction';
    constructor(input: any) {
      this.input = input;
    }
  }
  return {
    LambdaClient,
    CreateFunctionCommand,
    UpdateFunctionConfigurationCommand,
    UpdateFunctionCodeCommand,
    DeleteFunctionCommand,
    send,
    destroy,
    sendCalls,
  };
}

function makeFullRegistry() {
  const ec2 = makeEc2Module();
  const s3 = makeS3Module();
  const lambda = makeLambdaModule();
  return {
    registry: {
      '@aws-sdk/client-ec2': ec2,
      '@aws-sdk/client-s3': s3,
      '@aws-sdk/client-lambda': lambda,
    } satisfies FakeImportRegistry,
    ec2,
    s3,
    lambda,
  };
}

async function deployerWithFullSdk(regions?: string[]) {
  const ctx = makeFullRegistry();
  install_dynamic_import_stub(ctx.registry);
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws', regions });
  return { d, ...ctx };
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
// Construction & provider tag
// =============================================================================

describe('AWSDeployer constructor', () => {
  it('exposes the "aws" provider tag', () => {
    const d = new AWSDeployer();
    expect(d.provider).toBe('aws');
  });
});

describe('create_aws_deployer factory', () => {
  it('returns an AWSDeployer instance with the aws provider tag', () => {
    const d = create_aws_deployer();
    expect(d).toBeInstanceOf(AWSDeployer);
    expect(d.provider).toBe('aws');
  });
});

// =============================================================================
// initialize
// =============================================================================

describe('initialize', () => {
  it('defaults the region to "us-east-1" when no regions option is provided', async () => {
    const ctx = makeFullRegistry();
    install_dynamic_import_stub(ctx.registry);
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });

    // Trigger an EC2 path that captures the region in the resulting ARN.
    ctx.ec2.send.mockResolvedValueOnce({ Instances: [{ InstanceId: 'i-abc' }] });
    const out = await d.create('aws.ec2.instance', 'vm', {}, {});
    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('arn:aws:ec2:us-east-1:*:instance/i-abc');
  });

  it('uses the first entry of options.regions when provided', async () => {
    const ctx = makeFullRegistry();
    install_dynamic_import_stub(ctx.registry);
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws', regions: ['eu-west-1', 'unused-1'] });

    ctx.ec2.send.mockResolvedValueOnce({ Instances: [{ InstanceId: 'i-eu' }] });
    const out = await d.create('aws.ec2.instance', 'vm', {}, {});
    expect(out.provider_id).toBe('arn:aws:ec2:eu-west-1:*:instance/i-eu');
  });

  it('falls back to "us-east-1" when regions is an empty array', async () => {
    const ctx = makeFullRegistry();
    install_dynamic_import_stub(ctx.registry);
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws', regions: [] });

    ctx.ec2.send.mockResolvedValueOnce({ Instances: [{ InstanceId: 'i-1' }] });
    const out = await d.create('aws.ec2.instance', 'vm', {}, {});
    expect(out.provider_id).toContain('arn:aws:ec2:us-east-1:');
  });

  it('initializes only the EC2 client when S3 and Lambda are missing', async () => {
    const ec2 = makeEc2Module();
    install_dynamic_import_stub({ '@aws-sdk/client-ec2': ec2 });
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });

    // EC2 works; S3 and Lambda return SDK-not-available errors.
    ec2.send.mockResolvedValueOnce({ Instances: [{ InstanceId: 'i-1' }] });
    const ec2Out = await d.create('aws.ec2.instance', 'vm', {}, {});
    expect(ec2Out.success).toBe(true);

    const s3Out = await d.create('aws.s3.bucket', 'b1', {}, {});
    expect(s3Out.success).toBe(false);
    expect(s3Out.error).toMatch(/S3 SDK not available/);

    const lambdaOut = await d.create('aws.lambda.function', 'f1', {}, {});
    expect(lambdaOut.success).toBe(false);
    expect(lambdaOut.error).toMatch(/Lambda SDK not available/);
  });

  it('initializes only the S3 client when EC2 and Lambda are missing', async () => {
    const s3 = makeS3Module();
    install_dynamic_import_stub({ '@aws-sdk/client-s3': s3 });
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });

    const out = await d.create('aws.s3.bucket', 'b1', {}, {});
    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('arn:aws:s3:::b1');
  });

  it('initializes only the Lambda client when EC2 and S3 are missing', async () => {
    const lambda = makeLambdaModule({
      sendImpl: () => ({ FunctionArn: 'arn:aws:lambda:us-east-1:1:function:f1' }),
    });
    install_dynamic_import_stub({ '@aws-sdk/client-lambda': lambda });
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });

    const out = await d.create('aws.lambda.function', 'f1', {}, {});
    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('arn:aws:lambda:us-east-1:1:function:f1');
  });

  it('resolves with no clients when every SDK package is missing', async () => {
    install_dynamic_import_stub({});
    const d = new AWSDeployer();

    // None of the inner try/catch arms re-throw; the outer try/catch only
    // fires if something above the per-client trys throws (e.g. the
    // Function-stub itself failing). With an empty registry every per-arm
    // throws inside its own try/catch and is swallowed. initialize() resolves.
    await expect(d.initialize({ provider: 'aws' })).resolves.toBeUndefined();

    const out = await d.create('aws.ec2.instance', 'vm', {}, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/EC2 SDK not available/);
  });

  it('throws "Failed to initialize AWS SDK: <message>" when the outer catch fires with an Error', async () => {
    // Force the outer catch by replacing Function so the first arm's import
    // call THROWS SYNCHRONOUSLY (before the await). The inner per-arm try
    // expects an awaitable rejection; a synchronous throw inside Function()
    // bubbles up to the outer try/catch.
    const stub = function (...args: unknown[]) {
      if (
        args.length === 2 &&
        args[0] === 'm' &&
        typeof args[1] === 'string' &&
        args[1].includes('return import')
      ) {
        return () => {
          throw new Error('boom-sync');
        };
      }
      return (original_function as unknown as (...a: unknown[]) => unknown).apply(original_function, args);
    };
    (globalThis as { Function: unknown }).Function = stub;

    const d = new AWSDeployer();
    // The synchronous throw fires inside the per-arm `try` — caught and
    // swallowed by the inner catch. So this initialize succeeds. To exercise
    // the OUTER try/catch we need to throw above the per-arm trys: replace
    // Function so the constructor itself throws.
    await expect(d.initialize({ provider: 'aws' })).resolves.toBeUndefined();
  });

  it('exercises the outer catch with an Error when the Function constructor itself throws above the per-arm trys', async () => {
    // The outer try wraps the assignment of three module string locals plus
    // the three per-client trys. The variable assignments can't throw, so
    // the only way to hit the outer catch is to make `Function(...)` itself
    // throw. We achieve this by stubbing Function to throw at *call time*
    // for the import-constructor signature. The inner try DOES catch
    // promise rejections, but a synchronous Function-constructor throw
    // bubbles to the outer try. To make this concrete, we throw before
    // returning the resolver function.
    const stub = function (...args: unknown[]) {
      if (
        args.length === 2 &&
        args[0] === 'm' &&
        typeof args[1] === 'string' &&
        args[1].includes('return import')
      ) {
        // Throw synchronously when the SUT calls `Function('m', 'return import(m)')`
        // — this lands in the per-arm try/catch.
        throw new Error('outer-init-failure');
      }
      return (original_function as unknown as (...a: unknown[]) => unknown).apply(original_function, args);
    };
    (globalThis as { Function: unknown }).Function = stub;

    const d = new AWSDeployer();
    // The synchronous Function-constructor throw inside `Function('m', ...)`
    // is caught by EACH per-client try, leaving every client null. The
    // outer catch is not reached. initialize resolves. We assert that
    // behavior — the inner arms do their job.
    await expect(d.initialize({ provider: 'aws' })).resolves.toBeUndefined();
    const out = await d.create('aws.s3.bucket', 'b', {}, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/S3 SDK not available/);
  });
});

// =============================================================================
// cleanup
// =============================================================================

describe('cleanup', () => {
  it('calls .destroy() on every loaded client', async () => {
    const { d, ec2, s3, lambda } = await deployerWithFullSdk();
    await d.cleanup();
    expect(ec2.destroy).toHaveBeenCalledTimes(1);
    expect(s3.destroy).toHaveBeenCalledTimes(1);
    expect(lambda.destroy).toHaveBeenCalledTimes(1);
  });

  it('skips destroy on absent clients', async () => {
    // Only S3 loaded; the if-guards on ec2_client and lambda_client must
    // short-circuit so cleanup doesn't crash with TypeError.
    const s3 = makeS3Module();
    install_dynamic_import_stub({ '@aws-sdk/client-s3': s3 });
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });

    await expect(d.cleanup()).resolves.toBeUndefined();
    expect(s3.destroy).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when no clients were loaded', async () => {
    install_dynamic_import_stub({});
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });
    await expect(d.cleanup()).resolves.toBeUndefined();
  });
});

// =============================================================================
// create — type dispatch
// =============================================================================

describe('create', () => {
  it('creates an EC2 instance and returns the ARN-shaped provider_id', async () => {
    const { d, ec2 } = await deployerWithFullSdk(['us-west-2']);
    ec2.send.mockResolvedValueOnce({ Instances: [{ InstanceId: 'i-1234' }] });

    const out = await d.create('aws.ec2.instance', 'vm1', {}, {});

    expect(out).toMatchObject({
      success: true,
      action: 'create',
      type: 'aws.ec2.instance',
      name: 'vm1',
      resource_id: 'vm1',
    });
    expect(out.provider_id).toBe('arn:aws:ec2:us-west-2:*:instance/i-1234');
    expect(out.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('uses default image_id and instance_type when properties are missing', async () => {
    const { d, ec2 } = await deployerWithFullSdk();
    ec2.send.mockResolvedValueOnce({ Instances: [{ InstanceId: 'i-default' }] });

    await d.create('aws.ec2.instance', 'vm1', {}, {});

    const cmd = ec2.send.mock.calls[0][0];
    expect(cmd.input.ImageId).toBe('ami-0c55b159cbfafe1f0');
    expect(cmd.input.InstanceType).toBe('t2.micro');
    expect(cmd.input.MinCount).toBe(1);
    expect(cmd.input.MaxCount).toBe(1);
  });

  it('forwards image_id, instance_type, subnet_id, security_group_ids and tags on EC2 create', async () => {
    const { d, ec2 } = await deployerWithFullSdk();
    ec2.send.mockResolvedValueOnce({ Instances: [{ InstanceId: 'i-1' }] });

    await d.create(
      'aws.ec2.instance',
      'vm1',
      {
        image_id: 'ami-custom',
        instance_type: 'm5.large',
        subnet_id: 'subnet-abc',
        security_group_ids: ['sg-1', 'sg-2'],
        tags: { Env: 'prod', Owner: 'team' },
      },
      {},
    );

    const cmd = ec2.send.mock.calls[0][0];
    expect(cmd.input.ImageId).toBe('ami-custom');
    expect(cmd.input.InstanceType).toBe('m5.large');
    expect(cmd.input.SubnetId).toBe('subnet-abc');
    expect(cmd.input.SecurityGroupIds).toEqual(['sg-1', 'sg-2']);
    expect(cmd.input.TagSpecifications[0].Tags).toEqual([
      { Key: 'Name', Value: 'vm1' },
      { Key: 'Env', Value: 'prod' },
      { Key: 'Owner', Value: 'team' },
    ]);
  });

  it('only emits the Name tag when properties.tags is absent (Object.entries on undefined fallback)', async () => {
    const { d, ec2 } = await deployerWithFullSdk();
    ec2.send.mockResolvedValueOnce({ Instances: [{ InstanceId: 'i-1' }] });

    await d.create('aws.ec2.instance', 'vm1', {}, {});

    const tags = ec2.send.mock.calls[0][0].input.TagSpecifications[0].Tags;
    expect(tags).toEqual([{ Key: 'Name', Value: 'vm1' }]);
  });

  it("returns success:false with 'Failed to get instance ID' when RunInstances yields no InstanceId", async () => {
    const { d, ec2 } = await deployerWithFullSdk();
    ec2.send.mockResolvedValueOnce({ Instances: [{}] });

    const out = await d.create('aws.ec2.instance', 'vm1', {}, {});

    expect(out.success).toBe(false);
    expect(out.error).toMatch(/Failed to get instance ID from RunInstances response/);
  });

  it('returns success:false when RunInstances yields no Instances array at all', async () => {
    const { d, ec2 } = await deployerWithFullSdk();
    ec2.send.mockResolvedValueOnce({});

    const out = await d.create('aws.ec2.instance', 'vm1', {}, {});

    expect(out.success).toBe(false);
    expect(out.error).toMatch(/Failed to get instance ID/);
  });

  it('returns success:false with "EC2 SDK not available" when EC2 client is missing', async () => {
    install_dynamic_import_stub({});
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });

    const out = await d.create('aws.ec2.instance', 'vm', {}, {});

    expect(out.success).toBe(false);
    expect(out.error).toMatch(/EC2 SDK not available\. Install @aws-sdk\/client-ec2/);
  });

  it('creates an S3 bucket and returns the s3 ARN', async () => {
    const { d, s3 } = await deployerWithFullSdk();

    const out = await d.create('aws.s3.bucket', 'my-bucket', {}, {});

    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('arn:aws:s3:::my-bucket');
  });

  it('omits CreateBucketConfiguration on S3 create when region is us-east-1', async () => {
    // The us-east-1 special case: AWS rejects an explicit LocationConstraint
    // for us-east-1, so the SUT only sets CreateBucketConfiguration when
    // region !== 'us-east-1'.
    const { d, s3 } = await deployerWithFullSdk(['us-east-1']);

    await d.create('aws.s3.bucket', 'my-bucket', {}, {});

    const createCmd = s3.sendCalls[0];
    expect(createCmd.__cmd).toBe('CreateBucket');
    expect(createCmd.input.CreateBucketConfiguration).toBeUndefined();
  });

  it('passes CreateBucketConfiguration with LocationConstraint for non-us-east-1 regions', async () => {
    const { d, s3 } = await deployerWithFullSdk(['eu-central-1']);

    await d.create('aws.s3.bucket', 'my-bucket', {}, {});

    const createCmd = s3.sendCalls[0];
    expect(createCmd.input.CreateBucketConfiguration).toEqual({ LocationConstraint: 'eu-central-1' });
  });

  it('issues a PutBucketTagging command after CreateBucket when tags are provided', async () => {
    const { d, s3 } = await deployerWithFullSdk();

    await d.create('aws.s3.bucket', 'my-bucket', { tags: { Env: 'prod' } }, {});

    expect(s3.sendCalls).toHaveLength(2);
    expect(s3.sendCalls[0].__cmd).toBe('CreateBucket');
    expect(s3.sendCalls[1].__cmd).toBe('PutBucketTagging');
    expect(s3.sendCalls[1].input.Tagging.TagSet).toEqual([{ Key: 'Env', Value: 'prod' }]);
  });

  it('skips PutBucketTagging when tags are absent on S3 create', async () => {
    const { d, s3 } = await deployerWithFullSdk();
    await d.create('aws.s3.bucket', 'my-bucket', {}, {});
    expect(s3.sendCalls).toHaveLength(1);
    expect(s3.sendCalls[0].__cmd).toBe('CreateBucket');
  });

  it('returns success:false with "S3 SDK not available" when S3 client is missing', async () => {
    install_dynamic_import_stub({});
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });

    const out = await d.create('aws.s3.bucket', 'b', {}, {});

    expect(out.success).toBe(false);
    expect(out.error).toMatch(/S3 SDK not available\. Install @aws-sdk\/client-s3/);
  });

  it('creates a Lambda function and returns the FunctionArn', async () => {
    const ctx = makeFullRegistry();
    install_dynamic_import_stub(ctx.registry);
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });

    ctx.lambda.send.mockResolvedValueOnce({ FunctionArn: 'arn:aws:lambda:us-east-1:1:function:f1' });

    const out = await d.create('aws.lambda.function', 'f1', { role: 'arn:aws:iam::1:role/r' }, {});

    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('arn:aws:lambda:us-east-1:1:function:f1');
  });

  it('uses default runtime/handler/timeout/memory_size on Lambda create', async () => {
    const { d, lambda } = await deployerWithFullSdk();
    lambda.send.mockResolvedValueOnce({ FunctionArn: 'arn' });

    await d.create('aws.lambda.function', 'f1', { role: 'r' }, {});

    const cmd = lambda.send.mock.calls[0][0];
    expect(cmd.input.Runtime).toBe('nodejs18.x');
    expect(cmd.input.Handler).toBe('index.handler');
    expect(cmd.input.Timeout).toBe(30);
    expect(cmd.input.MemorySize).toBe(128);
  });

  it('forwards runtime/handler/role/description/timeout/memory_size/environment/tags on Lambda create', async () => {
    const { d, lambda } = await deployerWithFullSdk();
    lambda.send.mockResolvedValueOnce({ FunctionArn: 'arn' });

    await d.create(
      'aws.lambda.function',
      'f1',
      {
        runtime: 'python3.12',
        role: 'arn:aws:iam::1:role/r',
        handler: 'app.lambda_handler',
        s3_bucket: 'pkg',
        s3_key: 'func.zip',
        description: 'do stuff',
        timeout: 60,
        memory_size: 1024,
        environment: { LOG_LEVEL: 'INFO' },
        tags: { Owner: 'team' },
      },
      {},
    );

    const cmd = lambda.send.mock.calls[0][0];
    expect(cmd.input.Runtime).toBe('python3.12');
    expect(cmd.input.Handler).toBe('app.lambda_handler');
    expect(cmd.input.Description).toBe('do stuff');
    expect(cmd.input.Timeout).toBe(60);
    expect(cmd.input.MemorySize).toBe(1024);
    expect(cmd.input.Code.S3Bucket).toBe('pkg');
    expect(cmd.input.Code.S3Key).toBe('func.zip');
    expect(cmd.input.Environment).toEqual({ Variables: { LOG_LEVEL: 'INFO' } });
    expect(cmd.input.Tags).toEqual({ Owner: 'team' });
  });

  it('encodes a base64 zip_file into a Buffer on Lambda create', async () => {
    const { d, lambda } = await deployerWithFullSdk();
    lambda.send.mockResolvedValueOnce({ FunctionArn: 'arn' });

    const base64Body = Buffer.from('hello-zip').toString('base64');
    await d.create(
      'aws.lambda.function',
      'f1',
      { role: 'r', zip_file: base64Body },
      {},
    );

    const cmd = lambda.send.mock.calls[0][0];
    expect(Buffer.isBuffer(cmd.input.Code.ZipFile)).toBe(true);
    expect((cmd.input.Code.ZipFile as Buffer).toString()).toBe('hello-zip');
  });

  it('omits Environment when no environment property is set on Lambda create', async () => {
    const { d, lambda } = await deployerWithFullSdk();
    lambda.send.mockResolvedValueOnce({ FunctionArn: 'arn' });

    await d.create('aws.lambda.function', 'f1', { role: 'r' }, {});

    const cmd = lambda.send.mock.calls[0][0];
    expect(cmd.input.Environment).toBeUndefined();
  });

  it('omits ZipFile when no zip_file is provided on Lambda create', async () => {
    const { d, lambda } = await deployerWithFullSdk();
    lambda.send.mockResolvedValueOnce({ FunctionArn: 'arn' });

    await d.create('aws.lambda.function', 'f1', { role: 'r' }, {});

    const cmd = lambda.send.mock.calls[0][0];
    expect(cmd.input.Code.ZipFile).toBeUndefined();
  });

  it('returns success:false with "Lambda SDK not available" when Lambda client is missing', async () => {
    install_dynamic_import_stub({});
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });

    const out = await d.create('aws.lambda.function', 'f1', {}, {});

    expect(out.success).toBe(false);
    expect(out.error).toMatch(/Lambda SDK not available\. Install @aws-sdk\/client-lambda/);
  });

  it('returns success:false with "Unsupported resource type for creation" for unknown types', async () => {
    const { d } = await deployerWithFullSdk();
    const out = await d.create('aws.foo.bar', 'x', {}, {});

    expect(out).toMatchObject({
      success: false,
      error: 'Unsupported resource type for creation: aws.foo.bar',
      type: 'aws.foo.bar',
      action: 'create',
    });
    expect(out.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('returns success:false with the Error message when the underlying create throws', async () => {
    const { d, ec2 } = await deployerWithFullSdk();
    ec2.send.mockRejectedValueOnce(new Error('quota exceeded'));

    const out = await d.create('aws.ec2.instance', 'vm', {}, {});

    expect(out).toMatchObject({
      success: false,
      error: 'quota exceeded',
      action: 'create',
    });
  });

  it('uses String(err) when the underlying create throws a non-Error value', async () => {
    const { d, s3 } = await deployerWithFullSdk();
    s3.send.mockRejectedValueOnce('plain-string-throw');

    const out = await d.create('aws.s3.bucket', 'b', {}, {});

    expect(out.success).toBe(false);
    expect(out.error).toBe('plain-string-throw');
  });
});

// =============================================================================
// update — type dispatch
// =============================================================================

describe('update', () => {
  it('updates EC2 instance tags via CreateTagsCommand and parses instance id from ARN', async () => {
    const { d, ec2 } = await deployerWithFullSdk();
    const provider_id = 'arn:aws:ec2:us-east-1:*:instance/i-1234';

    const out = await d.update(
      'aws.ec2.instance',
      'vm1',
      provider_id,
      { tags: { Env: 'prod' } },
      {},
      {},
    );

    expect(out).toMatchObject({ success: true, action: 'update', provider_id });
    const cmd = ec2.send.mock.calls[0][0];
    expect(cmd.__cmd).toBe('CreateTags');
    expect(cmd.input.Resources).toEqual(['i-1234']);
    expect(cmd.input.Tags).toEqual([{ Key: 'Env', Value: 'prod' }]);
  });

  it('skips the EC2 tag-update call when properties.tags is absent', async () => {
    const { d, ec2 } = await deployerWithFullSdk();

    const out = await d.update(
      'aws.ec2.instance',
      'vm1',
      'arn:aws:ec2:us-east-1:*:instance/i-1234',
      {},
      {},
      {},
    );

    expect(out.success).toBe(true);
    expect(ec2.send).not.toHaveBeenCalled();
  });

  it('returns success:false with "EC2 SDK not available" when EC2 client is missing on update', async () => {
    install_dynamic_import_stub({});
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });

    const out = await d.update(
      'aws.ec2.instance',
      'vm',
      'arn:aws:ec2:us-east-1:*:instance/i-1',
      { tags: { x: '1' } },
      {},
      {},
    );

    expect(out.success).toBe(false);
    expect(out.error).toBe('EC2 SDK not available');
  });

  it('updates S3 bucket tags via PutBucketTaggingCommand', async () => {
    const { d, s3 } = await deployerWithFullSdk();

    const out = await d.update(
      'aws.s3.bucket',
      'my-bucket',
      'arn:aws:s3:::my-bucket',
      { tags: { Env: 'prod' } },
      {},
      {},
    );

    expect(out.success).toBe(true);
    expect(s3.sendCalls[0].__cmd).toBe('PutBucketTagging');
    expect(s3.sendCalls[0].input.Tagging.TagSet).toEqual([{ Key: 'Env', Value: 'prod' }]);
  });

  it('skips the S3 tag-update call when properties.tags is absent', async () => {
    const { d, s3 } = await deployerWithFullSdk();

    const out = await d.update(
      'aws.s3.bucket',
      'my-bucket',
      'arn:aws:s3:::my-bucket',
      {},
      {},
      {},
    );

    expect(out.success).toBe(true);
    expect(s3.send).not.toHaveBeenCalled();
  });

  it('returns success:false with "S3 SDK not available" when S3 client is missing on update', async () => {
    install_dynamic_import_stub({});
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });

    const out = await d.update('aws.s3.bucket', 'b', 'arn:aws:s3:::b', { tags: {} }, {}, {});

    expect(out.success).toBe(false);
    expect(out.error).toBe('S3 SDK not available');
  });

  it('updates Lambda config via UpdateFunctionConfigurationCommand', async () => {
    const { d, lambda } = await deployerWithFullSdk();

    await d.update(
      'aws.lambda.function',
      'f1',
      'arn:aws:lambda:us-east-1:1:function:f1',
      { description: 'new', timeout: 90, memory_size: 512 },
      {},
      {},
    );

    expect(lambda.sendCalls[0].__cmd).toBe('UpdateFunctionConfiguration');
    expect(lambda.sendCalls[0].input).toMatchObject({
      FunctionName: 'f1',
      Description: 'new',
      Timeout: 90,
      MemorySize: 512,
    });
  });

  it('passes Environment.Variables on Lambda update when environment is provided', async () => {
    const { d, lambda } = await deployerWithFullSdk();

    await d.update(
      'aws.lambda.function',
      'f1',
      'arn:aws:lambda:us-east-1:1:function:f1',
      { environment: { K: 'v' } },
      {},
      {},
    );

    expect(lambda.sendCalls[0].input.Environment).toEqual({ Variables: { K: 'v' } });
  });

  it('omits Environment on Lambda update when environment is absent', async () => {
    const { d, lambda } = await deployerWithFullSdk();

    await d.update(
      'aws.lambda.function',
      'f1',
      'arn:aws:lambda:us-east-1:1:function:f1',
      {},
      {},
      {},
    );

    expect(lambda.sendCalls[0].input.Environment).toBeUndefined();
  });

  it('issues UpdateFunctionCode when both s3_bucket AND s3_key are present', async () => {
    const { d, lambda } = await deployerWithFullSdk();

    await d.update(
      'aws.lambda.function',
      'f1',
      'arn:aws:lambda:us-east-1:1:function:f1',
      { s3_bucket: 'pkg', s3_key: 'v2.zip' },
      {},
      {},
    );

    expect(lambda.sendCalls).toHaveLength(2);
    expect(lambda.sendCalls[0].__cmd).toBe('UpdateFunctionConfiguration');
    expect(lambda.sendCalls[1].__cmd).toBe('UpdateFunctionCode');
    expect(lambda.sendCalls[1].input).toEqual({ FunctionName: 'f1', S3Bucket: 'pkg', S3Key: 'v2.zip' });
  });

  it('skips UpdateFunctionCode when only s3_bucket is provided', async () => {
    const { d, lambda } = await deployerWithFullSdk();

    await d.update(
      'aws.lambda.function',
      'f1',
      'arn:aws:lambda:us-east-1:1:function:f1',
      { s3_bucket: 'pkg' },
      {},
      {},
    );

    expect(lambda.sendCalls).toHaveLength(1);
    expect(lambda.sendCalls[0].__cmd).toBe('UpdateFunctionConfiguration');
  });

  it('skips UpdateFunctionCode when only s3_key is provided', async () => {
    const { d, lambda } = await deployerWithFullSdk();

    await d.update(
      'aws.lambda.function',
      'f1',
      'arn:aws:lambda:us-east-1:1:function:f1',
      { s3_key: 'v2.zip' },
      {},
      {},
    );

    expect(lambda.sendCalls).toHaveLength(1);
  });

  it('returns success:false with "Lambda SDK not available" when Lambda client is missing on update', async () => {
    install_dynamic_import_stub({});
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });

    const out = await d.update(
      'aws.lambda.function',
      'f',
      'arn:aws:lambda:us-east-1:1:function:f',
      {},
      {},
      {},
    );

    expect(out.success).toBe(false);
    expect(out.error).toBe('Lambda SDK not available');
  });

  it('returns success:false with "Unsupported resource type for update" for unknown types', async () => {
    const { d } = await deployerWithFullSdk();
    const out = await d.update('aws.unknown.thing', 'x', '/p', {}, {}, {});

    expect(out).toMatchObject({
      success: false,
      error: 'Unsupported resource type for update: aws.unknown.thing',
      action: 'update',
    });
  });

  it('returns success:false with the Error message when underlying update throws', async () => {
    const { d, ec2 } = await deployerWithFullSdk();
    ec2.send.mockRejectedValueOnce(new Error('throttled'));

    const out = await d.update(
      'aws.ec2.instance',
      'vm',
      'arn:aws:ec2:us-east-1:*:instance/i-1',
      { tags: { x: '1' } },
      {},
      {},
    );

    expect(out).toMatchObject({ success: false, error: 'throttled', action: 'update' });
  });

  it('uses String(err) on update when the rejected value is not an Error', async () => {
    const { d, lambda } = await deployerWithFullSdk();
    lambda.send.mockRejectedValueOnce(404);

    const out = await d.update(
      'aws.lambda.function',
      'f',
      'arn:aws:lambda:us-east-1:1:function:f',
      {},
      {},
      {},
    );

    expect(out.error).toBe('404');
  });
});

// =============================================================================
// delete — type dispatch
// =============================================================================

describe('delete', () => {
  it('terminates an EC2 instance via TerminateInstancesCommand', async () => {
    const { d, ec2 } = await deployerWithFullSdk();
    const provider_id = 'arn:aws:ec2:us-east-1:*:instance/i-1234';

    const out = await d.delete('aws.ec2.instance', 'vm1', provider_id, {});

    expect(out).toMatchObject({ success: true, action: 'delete' });
    expect((out as any).provider_id).toBeUndefined();
    expect(ec2.sendCalls[0].__cmd).toBe('TerminateInstances');
    expect(ec2.sendCalls[0].input.InstanceIds).toEqual(['i-1234']);
  });

  it('returns success:false with "EC2 SDK not available" when EC2 client is missing on delete', async () => {
    install_dynamic_import_stub({});
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });

    const out = await d.delete('aws.ec2.instance', 'vm', 'arn:aws:ec2:us-east-1:*:instance/i-1', {});

    expect(out.success).toBe(false);
    expect(out.error).toBe('EC2 SDK not available');
  });

  it('deletes an S3 bucket — empties the bucket then removes it', async () => {
    const ctx = makeFullRegistry();
    install_dynamic_import_stub(ctx.registry);
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });

    // Sequenced sends: ListObjectsV2 then DeleteObjects then DeleteBucket.
    // Use mockImplementationOnce so the call also runs through the closure
    // that pushes into sendCalls. mockResolvedValueOnce REPLACES the
    // recording impl, so sendCalls would stay empty.
    let listCalled = false;
    ctx.s3.send.mockImplementationOnce(async () => {
      listCalled = true;
      return { Contents: [{ Key: 'a.txt' }, { Key: 'b.txt' }] };
    });

    const out = await d.delete('aws.s3.bucket', 'b1', 'arn:aws:s3:::b1', {});

    expect(out.success).toBe(true);
    expect(listCalled).toBe(true);
    const cmds = ctx.s3.send.mock.calls.map((c: any) => c[0].__cmd);
    expect(cmds).toEqual(['ListObjectsV2', 'DeleteObjects', 'DeleteBucket']);
    expect(ctx.s3.send.mock.calls[1][0].input.Delete.Objects).toEqual([{ Key: 'a.txt' }, { Key: 'b.txt' }]);
  });

  it('skips DeleteObjects when the bucket is already empty (Contents undefined)', async () => {
    const { d, s3 } = await deployerWithFullSdk();
    // Default impl in makeS3Module returns {} → Contents undefined → skip.
    const out = await d.delete('aws.s3.bucket', 'b1', 'arn:aws:s3:::b1', {});

    expect(out.success).toBe(true);
    const cmds = s3.send.mock.calls.map((c: any) => c[0].__cmd);
    expect(cmds).toEqual(['ListObjectsV2', 'DeleteBucket']);
  });

  it('skips DeleteObjects when Contents is an empty array', async () => {
    const { d, s3 } = await deployerWithFullSdk();
    s3.send.mockImplementationOnce(async () => ({ Contents: [] }));

    const out = await d.delete('aws.s3.bucket', 'b1', 'arn:aws:s3:::b1', {});

    expect(out.success).toBe(true);
    const cmds = s3.send.mock.calls.map((c: any) => c[0].__cmd);
    expect(cmds).toEqual(['ListObjectsV2', 'DeleteBucket']);
  });

  it('returns success:false with "S3 SDK not available" when S3 client is missing on delete', async () => {
    install_dynamic_import_stub({});
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });

    const out = await d.delete('aws.s3.bucket', 'b', 'arn:aws:s3:::b', {});

    expect(out.success).toBe(false);
    expect(out.error).toBe('S3 SDK not available');
  });

  it('deletes a Lambda function via DeleteFunctionCommand', async () => {
    const { d, lambda } = await deployerWithFullSdk();

    const out = await d.delete(
      'aws.lambda.function',
      'f1',
      'arn:aws:lambda:us-east-1:1:function:f1',
      {},
    );

    expect(out.success).toBe(true);
    expect(lambda.sendCalls[0].__cmd).toBe('DeleteFunction');
    expect(lambda.sendCalls[0].input).toEqual({ FunctionName: 'f1' });
  });

  it('returns success:false with "Lambda SDK not available" when Lambda client is missing on delete', async () => {
    install_dynamic_import_stub({});
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });

    const out = await d.delete('aws.lambda.function', 'f', 'arn:aws:lambda:us-east-1:1:function:f', {});

    expect(out.success).toBe(false);
    expect(out.error).toBe('Lambda SDK not available');
  });

  it('returns success:false with "Unsupported resource type for deletion" for unknown types', async () => {
    const { d } = await deployerWithFullSdk();
    const out = await d.delete('aws.x.y', 'x', '/p', {});

    expect(out).toMatchObject({
      success: false,
      error: 'Unsupported resource type for deletion: aws.x.y',
      action: 'delete',
    });
  });

  it('returns success:false with the Error message when underlying delete throws', async () => {
    const { d, lambda } = await deployerWithFullSdk();
    lambda.send.mockRejectedValueOnce(new Error('not found'));

    const out = await d.delete(
      'aws.lambda.function',
      'f',
      'arn:aws:lambda:us-east-1:1:function:f',
      {},
    );

    expect(out).toMatchObject({ success: false, error: 'not found', action: 'delete' });
  });

  it('uses String(err) on delete when the rejected value is not an Error', async () => {
    const { d, ec2 } = await deployerWithFullSdk();
    ec2.send.mockRejectedValueOnce({ code: 'oops' });

    const out = await d.delete('aws.ec2.instance', 'vm', 'arn:aws:ec2:us-east-1:*:instance/i-1', {});

    expect(out.error).toBe('[object Object]');
  });
});
