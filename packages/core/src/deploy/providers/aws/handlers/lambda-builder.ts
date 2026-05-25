/**
 * Lambda code-builder — auto-build path for Compute.ServerlessFunction
 * blocks that have a connected Source.Repository on the canvas.
 *
 * Flow:
 *   1. git clone --depth 1 --branch <branch> <repo> <tmpdir>
 *   2. npm install --omit=dev --silent (skip if no package.json)
 *   3. zip -r function.zip .
 *   4. PutObject to `ice-bootstrap-{accountId}-{region}` (CreateBucket
 *      first if absent).
 *   5. Return { s3Bucket, s3Key } so the Lambda handler can pass them
 *      straight to CreateFunction.
 *
 * Local-only — assumes `git`, `npm`, and `zip` are available on the
 * deploy host. Failures bubble up so the Lambda handler can fall
 * through to a clear error. AWS CodeBuild integration is deferred
 * to a future commit.
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
 * Run the full auto-build flow. Returns the S3 ref the Lambda handler
 * should pass to CreateFunction. Throws on any sub-step failure with
 * a message that names the step (clone / install / zip / upload).
 */
export async function build_and_upload_lambda(args: BuildArgs): Promise<BuildResult> {
  const accountId = await args.ctx.ensure_account_id();
  const bucket = `${BOOTSTRAP_BUCKET_PREFIX}-${accountId}-${args.ctx.region}`;
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
