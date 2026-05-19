/**
 * Compute Engine long-running-operation poller. Extracted from
 * `load-balancer.ts` (rf-lbal-1).
 *
 * Compute API operations return a name; the caller polls
 * `/global/operations/<name>` until status === DONE. We give up after
 * 120 seconds and surface a timeout error so a stalled operation
 * doesn't block the whole deploy thread.
 */
import { SERVICE_NAMES, operation_failed, operation_timed_out } from '../../messages';
import { BASE_URL } from './result-helpers';
import type { GCPHandlerContext } from '../../types';

/** How long to wait for a single Compute Engine operation to reach DONE. */
const TIMEOUT_MS = 120_000;
/** Poll interval between operation status checks. */
const POLL_INTERVAL_MS = 3_000;

/**
 * Poll until a Compute Engine global operation reports `status: 'DONE'`,
 * throwing if the operation surfaces an `error` field or if we hit the
 * 120s timeout. Used by every multi-step Compute API call (URL maps,
 * proxies, forwarding rules, NEGs, backend services).
 */
export async function wait_for_compute_op(ctx: GCPHandlerContext, op_name: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    const op = (await ctx.rest_client.get(`${BASE_URL}/projects/${ctx.project}/global/operations/${op_name}`)) as any;
    if (op?.status === 'DONE') {
      if (op.error) throw new Error(operation_failed(SERVICE_NAMES.COMPUTE, JSON.stringify(op.error)));
      return;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(operation_timed_out(SERVICE_NAMES.COMPUTE));
}
