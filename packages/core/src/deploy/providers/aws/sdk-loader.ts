/**
 * AWS SDK Lazy Loader
 *
 * Centralised lazy loading of `@aws-sdk/client-*` packages. Uses the
 * `Function('m', 'return import(m)')` indirection so bundlers don't
 * try to resolve the optional SDK packages at build time — packages
 * absent from the install footprint fall through to `null` and the
 * caller emits a friendly "SDK not installed" message.
 *
 * Parallel to `../gcp/sdk-loader.ts`. New SDK packages get an entry
 * in `initialize_aws_clients` keyed by AWS service short-name; that
 * key is what handlers ask for via `ctx.clients.get('<service>')`.
 */

/**
 * Dynamically import an AWS SDK package. Returns null when the
 * package isn't installed (the cross-cloud test harness intercepts
 * this same pattern via a Function-constructor stub).
 */
export async function load_aws_sdk(module_name: string): Promise<any | null> {
  try {
    return await Function('m', 'return import(m)')(module_name);
  } catch {
    return null;
  }
}

/**
 * Initialise every AWS SDK client that's installed.
 *
 * Per-service short-name → constructor in this table is the schema
 * the rest of the deployer reads. Handlers index the resulting Map
 * by short-name (`ctx.clients.get('s3')`). Missing SDK packages are
 * silently skipped — handlers detect absence and return a clean
 * "install the package" message.
 */
export async function initialize_aws_clients(region: string): Promise<Map<string, unknown>> {
  const clients = new Map<string, unknown>();

  const ec2 = await load_aws_sdk('@aws-sdk/client-ec2');
  if (ec2) clients.set('ec2', new ec2.EC2Client({ region }));

  const s3 = await load_aws_sdk('@aws-sdk/client-s3');
  if (s3) clients.set('s3', new s3.S3Client({ region }));

  const lambda = await load_aws_sdk('@aws-sdk/client-lambda');
  if (lambda) clients.set('lambda', new lambda.LambdaClient({ region }));

  const cwl = await load_aws_sdk('@aws-sdk/client-cloudwatch-logs');
  if (cwl) clients.set('cloudwatch-logs', new cwl.CloudWatchLogsClient({ region }));

  return clients;
}

/**
 * Tear down every client in `clients` that exposes a `.destroy()`
 * method. Idempotent; safe to call when some clients never received
 * SDK loading.
 */
export function destroy_aws_clients(clients: Map<string, unknown>): void {
  for (const client of clients.values()) {
    if (client && typeof (client as { destroy?: () => void }).destroy === 'function') {
      (client as { destroy: () => void }).destroy();
    }
  }
}
