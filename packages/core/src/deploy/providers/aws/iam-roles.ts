/**
 * IAM role bootstrap helper used by the ECS handler (commit #23) to
 * ensure the default ecsTaskExecutionRole exists before service
 * creation. Idempotent — checks for the role first and only creates
 * it on miss.
 *
 * AWS's recommended default trust + managed policy attachment:
 *   - Trust:        ecs-tasks.amazonaws.com
 *   - Policy:       AmazonECSTaskExecutionRolePolicy (managed)
 *
 * Any future ICE-managed default role (Lambda execution role, etc.)
 * goes through the same ensureManagedRole pattern below.
 */

import { load_aws_sdk } from './sdk-loader';

const DEFAULT_ECS_TASK_ROLE = 'ecsTaskExecutionRole';
const DEFAULT_ECS_TASK_TRUST_POLICY = JSON.stringify({
  Version: '2012-10-17',
  Statement: [
    {
      Effect: 'Allow',
      Principal: { Service: 'ecs-tasks.amazonaws.com' },
      Action: 'sts:AssumeRole',
    },
  ],
});
const DEFAULT_ECS_TASK_MANAGED_POLICY_ARN = 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy';

/**
 * Ensure an IAM role exists with the given trust policy + a managed
 * policy attached. Returns the role ARN. Idempotent: getRole-first,
 * createRole on NoSuchEntity. AttachRolePolicy is best-effort —
 * already-attached policies return success.
 */
export async function ensureManagedRole(
  region: string,
  role_name: string,
  trust_policy_json: string,
  managed_policy_arn: string,
): Promise<string> {
  const iam = await load_aws_sdk('@aws-sdk/client-iam');
  if (!iam) throw new Error('AWS IAM SDK not available — install @aws-sdk/client-iam');

  const client = new iam.IAMClient({ region });
  try {
    // 1. Try fetching the role — happy path returns its ARN.
    try {
      const got = await client.send(new iam.GetRoleCommand({ RoleName: role_name }));
      if (got?.Role?.Arn) return got.Role.Arn;
    } catch (error) {
      const err = error as { name?: string; Code?: string };
      const code = err.name || err.Code || '';
      if (code !== 'NoSuchEntityException' && code !== 'NoSuchEntity') throw error;
      // Falls through to create.
    }

    // 2. Create the role.
    const created = await client.send(
      new iam.CreateRoleCommand({
        RoleName: role_name,
        AssumeRolePolicyDocument: trust_policy_json,
        Description: 'Auto-created by ICE',
        Path: '/',
      }),
    );
    const arn = created?.Role?.Arn;
    if (!arn) throw new Error(`CreateRole returned no ARN for ${role_name}`);

    // 3. Attach the managed policy. AlreadyAttached returns success;
    // any other error is fatal (the role exists but isn't usable).
    try {
      await client.send(new iam.AttachRolePolicyCommand({ RoleName: role_name, PolicyArn: managed_policy_arn }));
    } catch (error) {
      const err = error as { name?: string; Code?: string };
      const code = err.name || err.Code || '';
      if (code !== 'EntityAlreadyExistsException') throw error;
    }

    return arn;
  } finally {
    if (typeof (client as { destroy?: () => void }).destroy === 'function') {
      (client as { destroy: () => void }).destroy();
    }
  }
}

/**
 * Convenience for the most common case — the ECS task execution role.
 * Returns the ARN every Fargate task definition needs in `executionRoleArn`.
 */
export async function ensureEcsTaskExecutionRole(region: string): Promise<string> {
  return ensureManagedRole(
    region,
    DEFAULT_ECS_TASK_ROLE,
    DEFAULT_ECS_TASK_TRUST_POLICY,
    DEFAULT_ECS_TASK_MANAGED_POLICY_ARN,
  );
}
