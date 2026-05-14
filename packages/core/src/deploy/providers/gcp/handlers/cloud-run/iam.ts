/**
 * Public-access (allUsers invoker) IAM grant for Cloud Run services.
 * Extracted from `cloud-run.ts` (rf-crun-3) — used by both create_service
 * and the update path so the same grant runs on every deploy where
 * `allow_unauthenticated !== false`.
 *
 * ENGINE-18: Cloud Run v2 services accept `invokerIamDisabled` at create
 * / update time, but org policies sometimes block that flag. This setIamPolicy
 * call is the explicit fallback that makes the service publicly reachable
 * without forcing the user to fix the org policy.
 *
 * Best-effort: failure is logged via `ctx.on_log` and swallowed — the
 * service is already deployed, the IAM grant is a separate concern, so
 * we don't fail the whole deploy if this step trips.
 */
import type { GCPHandlerContext } from '../../types';

/**
 * Apply the `roles/run.invoker` binding for `allUsers` to a Cloud Run
 * service. No-ops when `allow_unauthenticated === false` or when
 * `provider_id` is empty.
 */
export async function grant_public_access(
  ctx: GCPHandlerContext,
  provider_id: string,
  properties: Record<string, unknown>,
): Promise<void> {
  if (properties.allow_unauthenticated === false || !provider_id) return;

  try {
    const iamUrl = `https://run.googleapis.com/v2/${provider_id}:setIamPolicy`;
    await ctx.rest_client.post(iamUrl, {
      policy: {
        bindings: [{ role: 'roles/run.invoker', members: ['allUsers'] }],
      },
    });
    ctx.on_log?.('Set public access (allUsers invoker)');
  } catch (iamErr: any) {
    ctx.on_log?.(`Warning: Could not set public access: ${iamErr.message || iamErr}`);
    // Non-fatal — service is deployed but may not be publicly accessible
  }
}
