/**
 * AWS account-id resolution via STS GetCallerIdentity.
 *
 * Two handlers need the caller's AWS account id:
 *   - S3 (commit #8) — appends `-{accountId}` to bucket names so
 *     globally-unique names don't collide across AWS accounts.
 *   - ECS (commit #23) — references the ecsTaskExecutionRole ARN,
 *     which embeds the account id.
 *
 * The deployer never knows the account id at process start (the
 * caller authenticates via env vars or `~/.aws/credentials`, both
 * of which are read by the SDK at first call). STS GetCallerIdentity
 * is the one-call resolution path; result is cached on the context
 * for the rest of the deploy.
 */

import { load_aws_sdk } from './sdk-loader';

/**
 * Account-id resolver shape attached to AWSHandlerContext when the
 * deployer initialises STS. Calling the function the first time
 * fetches + caches; subsequent calls return the cached value.
 */
export type AccountIdResolver = () => Promise<string>;

/**
 * Build a memoised resolver. The returned function makes at most one
 * STS call per process lifetime. Throws when the STS SDK isn't
 * installed OR the call fails (no point falling back to a fake id —
 * S3 bucket names would silently collide).
 */
export function create_account_id_resolver(region: string): AccountIdResolver {
  let cached: string | undefined;
  let in_flight: Promise<string> | undefined;
  return async () => {
    if (cached) return cached;
    if (in_flight) return in_flight;
    in_flight = (async () => {
      const sts = await load_aws_sdk('@aws-sdk/client-sts');
      if (!sts) {
        throw new Error(
          'AWS STS SDK not available — install @aws-sdk/client-sts to enable account-id-suffixed bucket names',
        );
      }
      const client = new sts.STSClient({ region });
      try {
        const result = await client.send(new sts.GetCallerIdentityCommand({}));
        if (!result?.Account) {
          throw new Error('STS GetCallerIdentity returned no Account field');
        }
        cached = String(result.Account);
        return cached;
      } finally {
        if (typeof (client as { destroy?: () => void }).destroy === 'function') {
          (client as { destroy: () => void }).destroy();
        }
      }
    })();
    try {
      return await in_flight;
    } finally {
      in_flight = undefined;
    }
  };
}
