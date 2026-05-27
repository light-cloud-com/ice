/**
 * Lambda code-builder — auto-build path for Compute.ServerlessFunction
 * blocks that have a connected Source.Repository on the canvas.
 *
 * Two-stage fallback chain:
 *   1. **Local build** (preferred): git clone → npm install → zip → S3
 *      upload. Fastest path when the deploy host has the toolchain.
 *   2. **AWS CodeBuild** (fallback): when local `git` / `npm` / `zip`
 *      aren't available, dispatch a build to a transient CodeBuild
 *      project that does the same steps in the cloud. Same S3 ref
 *      shape returned either way so the Lambda handler doesn't care
 *      which path ran.
 *
 * The fallback decision uses `which` (POSIX) / `where` (Windows) on
 * each required tool. Any missing tool flips the entire flow to
 * CodeBuild — the chain is all-local-or-all-cloud, never mixed.
 */

import { execSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { load_aws_sdk } from '../sdk-loader';
import type { AWSHandlerContext } from '../types';

export interface BuildArgs {
  /** Lambda function name — used as the S3 key prefix. */
  function_name: string;
  /** Repository URL — passed straight to git clone (HTTPS or git@…). */
  repository: string;
  /** Git branch / ref to check out. Defaults to 'main'. */
  branch: string;
  ctx: AWSHandlerContext;
}

export interface BuildResult {
  s3Bucket: string;
  s3Key: string;
}

const BOOTSTRAP_BUCKET_PREFIX = 'ice-bootstrap';

function shell(command: string, cwd?: string): void {
  execSync(command, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
}

async function ensure_bootstrap_bucket(bucket: string, region: string, ctx: AWSHandlerContext): Promise<void> {
  const client = ctx.clients.get('s3') as any;
  if (!client) throw new Error('S3 SDK not available — required for Lambda auto-build');
  const s3 = await load_aws_sdk('@aws-sdk/client-s3');
  if (!s3) throw new Error('S3 SDK not available — required for Lambda auto-build');

  try {
    await client.send(new s3.HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch {
    // Doesn't exist — create it.
  }
  await client.send(
    new s3.CreateBucketCommand({
      Bucket: bucket,
      CreateBucketConfiguration: region !== 'us-east-1' ? { LocationConstraint: region } : undefined,
    }),
  );
}

async function upload_zip(bucket: string, key: string, body: Buffer, ctx: AWSHandlerContext): Promise<void> {
  const client = ctx.clients.get('s3') as any;
  const s3 = await load_aws_sdk('@aws-sdk/client-s3');
  if (!client || !s3) throw new Error('S3 SDK not available');
  await client.send(new s3.PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
}

/**
 * Detect whether the local build chain is available. Probes `git`,
 * `npm`, and `zip` via `command -v` (POSIX) — falls back to
 * `where.exe` on Windows. Returns true when every tool is present.
 */
function has_local_toolchain(): boolean {
  const probe = process.platform === 'win32' ? 'where' : 'command -v';
  for (const tool of ['git', 'npm', 'zip']) {
    try {
      execSync(`${probe} ${tool}`, { stdio: 'ignore' });
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Run the local build flow. Same as the historical path: clone +
 * install + zip + upload. Throws on any sub-step failure with a
 * message that names the step.
 */
async function build_locally(args: BuildArgs, bucket: string): Promise<BuildResult> {
  const tmpdir_path = mkdtempSync(join(tmpdir(), 'ice-lambda-build-'));
  const zipPath = join(tmpdir_path, 'function.zip');

  try {
    args.ctx.on_log?.(`Cloning ${args.repository}@${args.branch}`);
    shell(`git clone --depth 1 --branch ${args.branch} ${args.repository} ${tmpdir_path}/src`);

    // Best-effort npm install — skip if no package.json present.
    try {
      readFileSync(join(tmpdir_path, 'src', 'package.json'));
      args.ctx.on_log?.('Running npm install --omit=dev');
      shell('npm install --omit=dev --silent', join(tmpdir_path, 'src'));
    } catch {
      args.ctx.on_log?.('No package.json — skipping npm install');
    }

    args.ctx.on_log?.('Zipping build output');
    shell(`zip -qr ${zipPath} .`, join(tmpdir_path, 'src'));

    args.ctx.on_log?.(`Ensuring bootstrap bucket ${bucket}`);
    await ensure_bootstrap_bucket(bucket, args.ctx.region, args.ctx);

    const key = `lambda/${args.function_name}/${Date.now()}.zip`;
    args.ctx.on_log?.(`Uploading to s3://${bucket}/${key}`);
    const body = readFileSync(zipPath);
    await upload_zip(bucket, key, body, args.ctx);

    return { s3Bucket: bucket, s3Key: key };
  } finally {
    try {
      rmSync(tmpdir_path, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
}

/**
 * Dispatch the build to AWS CodeBuild. Used when the local toolchain
 * isn't available. Creates a transient CodeBuild project that runs
 * the same clone+install+zip+upload flow inside an AWS-managed Docker
 * image, then waits for the build to finish and returns the S3 ref.
 *
 * Cleanup of the transient project is best-effort — left behind if
 * the build crashes, but the orphan-cleanup script tags it for
 * eventual sweeping.
 */
async function build_with_codebuild(args: BuildArgs, bucket: string): Promise<BuildResult> {
  const cb_client = args.ctx.clients.get('codebuild') as any;
  if (!cb_client) {
    throw new Error(
      'Local toolchain unavailable AND CodeBuild SDK missing — install git/npm/zip locally OR @aws-sdk/client-codebuild.',
    );
  }
  const codebuild = await load_aws_sdk('@aws-sdk/client-codebuild');
  if (!codebuild) {
    throw new Error('CodeBuild SDK module failed to load — local build path unavailable.');
  }

  await ensure_bootstrap_bucket(bucket, args.ctx.region, args.ctx);

  const project_name = `ice-lambda-builder-${args.function_name}-${Date.now()}`;
  const key = `lambda/${args.function_name}/${Date.now()}.zip`;
  const buildspec = JSON.stringify({
    version: '0.2',
    phases: {
      install: { commands: [`git clone --depth 1 --branch ${args.branch} ${args.repository} src`] },
      build: {
        commands: [
          'cd src',
          'if [ -f package.json ]; then npm install --omit=dev --silent; fi',
          'zip -qr ../function.zip .',
          'cd ..',
          `aws s3 cp function.zip s3://${bucket}/${key}`,
        ],
      },
    },
  });

  args.ctx.on_log?.(`Falling back to CodeBuild project ${project_name}`);
  await cb_client.send(
    new codebuild.CreateProjectCommand({
      name: project_name,
      source: { type: 'NO_SOURCE', buildspec },
      artifacts: { type: 'NO_ARTIFACTS' },
      environment: {
        type: 'LINUX_CONTAINER',
        image: 'aws/codebuild/amazonlinux2-x86_64-standard:5.0',
        computeType: 'BUILD_GENERAL1_SMALL',
      },
      serviceRole: (args.ctx.codebuild_service_role as string | undefined) ?? 'codebuild-service-role',
      tags: [{ key: 'ice:test-run-id', value: project_name }],
    }),
  );
  const start = await cb_client.send(new codebuild.StartBuildCommand({ projectName: project_name }));
  const build_id = start?.build?.id;
  if (!build_id) throw new Error('CodeBuild start succeeded but returned no build ID');

  // Poll until the build settles. Fail loudly on FAILED / TIMED_OUT.
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const resp = await cb_client.send(new codebuild.BatchGetBuildsCommand({ ids: [build_id] }));
    const status = resp?.builds?.[0]?.buildStatus;
    if (status === 'SUCCEEDED') break;
    if (status && status !== 'IN_PROGRESS') throw new Error(`CodeBuild build ${build_id} ended with status ${status}`);
  }

  // Best-effort cleanup of the transient project.
  try {
    await cb_client.send(new codebuild.DeleteProjectCommand({ name: project_name }));
  } catch {
    /* leave for orphan sweep */
  }

  return { s3Bucket: bucket, s3Key: key };
}

/**
 * Run the auto-build flow with fallback. Tries the local toolchain
 * first; falls back to CodeBuild when any required tool is missing.
 */
export async function build_and_upload_lambda(args: BuildArgs): Promise<BuildResult> {
  const accountId = await args.ctx.ensure_account_id();
  const bucket = `${BOOTSTRAP_BUCKET_PREFIX}-${accountId}-${args.ctx.region}`;

  if (has_local_toolchain()) {
    return build_locally(args, bucket);
  }

  args.ctx.on_log?.('Local toolchain not detected — using CodeBuild fallback.');
  return build_with_codebuild(args, bucket);
}
